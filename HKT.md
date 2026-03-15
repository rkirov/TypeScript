# TypeScript Higher-Kinded Types — Experimental Fork

## Goal

Add first-class support for higher-kinded types (HKTs) to TypeScript, enabling
abstraction over type constructors. This eliminates the need for defunctionalization
hacks (fp-ts style `HKT` interfaces, URI maps) by introducing kind annotations
directly into the type parameter syntax.

## Status

**v0 implementation complete.** The success criteria program typechecks end-to-end.
18 test cases pass in the standard test suite. Backward compatibility verified.
Higher-order kinds (`(* -> *) -> *`) fully supported.

**[Live demo](https://rkirov.github.io/TypeScript/)** — Monaco editor with
the custom compiler, try it in the browser.

### What works now

- Kind annotation syntax: `<F : * -> *>`, `<F : (*, *) -> *>`, `<F : (* -> *) -> *>`
- Parenthesized single-arg: `(*) -> *` is sugar for `* -> *`
- Concrete instantiation with built-in types: `Functor<Array>`, `Monad<Array>`
- Multi-param constructors: `Bifunctor<Pair>` where `Pair` has kind `(*, *) -> *`
- User-defined type constructors: `Functor<Box>` where `type Box<A> = { value: A }`
- Higher-order kinds: `<F : (* -> *) -> *>` — constructors that take constructors
- Type application: `F<A>` resolves to `Array<A>` when `F = Array`
- `Monad<F> extends Functor<F>` — HKT params forwarded through inheritance
- Generic functions: `lift<F : * -> *, A, B>(...)`, `when<F : * -> *>(...)`
- Type inference at call sites: `boxMonad.pure(42)` infers `Box<number>`
- Invariant assignability: `F<A>` not assignable to `F<B>` unless `A = B`
- Arity checking: `F<A, B>` errors when `F : * -> *`
- Incorrect implementation detection: returning `B` instead of `Array<B>`
- Full backward compatibility — all existing TS code compiles unchanged

### What doesn't work yet

- Kind mismatch errors for concrete types passed to HKT params (`Functor<number>`
  silently accepts instead of erroring)
- Multi-argument HKT inference (`sequence(boxMonad, [{value:1}])` infers
  `Box<unknown[]>` instead of `Box<number[]>` — single-arg inference works)
- Custom kind-mismatch error messages (uses generic TS errors instead of
  `Type 'number' has kind '*', but kind '* -> *' is required`)

## Syntax

Kind annotations use uncurried `(params) -> result` notation, attached to type
parameters with `:`. This is unambiguous because it only appears inside `<>` type
parameter lists, where `*` has no existing meaning.

```
Kind     = AtomKind '->' Kind        // right-associative arrow
         | AtomKind

AtomKind = '*'                        // concrete type
         | '(' Kind (',' Kind)* ')'   // grouped / tuple
```

### Examples

```typescript
// One type argument: * -> *
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

// Two type arguments: (*, *) -> *
interface Bifunctor<F : (*, *) -> *> {
  bimap<A, B, C, D>(fa: F<A, B>, f: (a: A) => C, g: (b: B) => D): F<C, D>;
}

// Higher-order: takes a type constructor, returns a type
type ApplyToNumber<F : * -> *> = F<number>;
type T = ApplyToNumber<Array>;  // number[]

// Takes a type constructor as an argument
type ApplyToArray<F : (* -> *) -> *> = F<Array>;
```

### Kinding rules

- `*` is the kind of all concrete types (`number`, `string`, `Array<number>`, etc.)
- `* -> *` is the kind of type constructors taking one argument (`Array`, `Promise`)
- `(*, *) -> *` is the kind of two-argument constructors (`Map`, `Pair`)
- `(* -> *) -> *` is the kind of higher-order constructors (take a constructor)
- `(*) -> *` is sugar for `* -> *`
- `->` is right-associative: `* -> * -> *` means `* -> (* -> *)`

## Implementation details

### Approach — no new tokens, no new AST node kinds

The `->` in kind annotations is parsed at the parser level by consuming `MinusToken`
then `GreaterThanToken` as a pair. This avoids adding a new scanner token and the
`GreaterThanToken` is consumed before the bracket-closing logic sees it.

Kind information is stored as both a simple arity number (`kindArity`) for fast
checks and a full kind tree (`KindNode`) for higher-order kind validation. No new
`SyntaxKind` entries needed.

### Kind representation

```typescript
type KindNode = StarKind | ArrowKind;
interface StarKind { kindTag: "star" }
interface ArrowKind { kindTag: "arrow"; params: KindNode[]; returnKind: KindNode }
```

The parser produces `KindNode` trees. The checker uses `kindsMatch()` for recursive
kind comparison and `getKindOfSymbol()` / `getKindOfType()` to compute kinds for
arbitrary types and symbols.

### Internal type representations

Two new internal type representations, both piggy-backing on `TypeFlags.Substitution`:

1. **TypeConstructorRef** — represents a reference to a type constructor (e.g., `Array`
   when passed as `Functor<Array>`). Carries the constructor's `Symbol` via
   `type.hktConstructorSymbol`. Created by `createTypeConstructorRef()`.

2. **HKTApplicationType** — represents `F<A>` where `F` is a type constructor parameter.
   Carries the type arguments via `type.hktTypeArguments`. The `baseType` is the
   TypeParameter `F`. Created by `createHKTApplicationType()`.

Both use `TypeFlags.Substitution` so they are automatically `Instantiable` and flow
through the existing instantiation infrastructure.

### Key checker modifications

- **`getTypeReferenceType`** — when a TypeParameter with `kindArity > 0` is used
  with type arguments (`F<A>`), creates an HKT application instead of erroring.
- **`getTypeFromClassOrInterfaceReference`** / **`getTypeFromTypeAliasReference`** —
  when a generic type like `Array` appears without type arguments in an HKT argument
  position, creates a TypeConstructorRef instead of erroring about missing args.
- **`instantiateTypeWorker`** — Substitution case extended to handle HKT applications:
  instantiates the constructor and args, then resolves via `resolveHKTApplication()`.
- **`getNormalizedType`** — skips normalization for HKT types (prevents stripping
  HKT metadata from SubstitutionType).
- **`isRelatedTo`** — structural comparison for HKT applications with the same
  constructor (invariant: compares type args bidirectionally).
- **`inferFromTypes`** — pairwise inference from HKT application type arguments.
- **`maybeTypeParameterReference`** — fixed to recognize `F<A>` as a reference to
  type parameter `F` (previously filtered out because `F` had type arguments).
  This was the critical fix that made `getObjectTypeInstantiation` include `F`
  in the outer type parameters, enabling proper member instantiation.
- **`resolveTypeConstructorArgument`** — uses full `kindsMatch()` for recursive kind
  checking instead of simple arity equality.
- **`isHKTTypeArgumentContext`** — handles TypeParameter parents for higher-order
  kinds (e.g., `F<Array>` where `F : (* -> *) -> *`).

### Files modified

| File | Changes |
|------|---------|
| `src/compiler/types.ts` | `kindArity`, `kindNode` on `TypeParameterDeclaration` and `TypeParameter`; `KindNode` type; `hktConstructorSymbol` and `hktTypeArguments` on `Type` |
| `src/compiler/parser.ts` | `parseKind()`, `parseKindAtom()`, `kindNodeToArity()`, modified `parseTypeParameter()` |
| `src/compiler/factory/nodeFactory.ts` | Initialize `kindArity` and `kindNode` fields |
| `src/compiler/checker.ts` | ~15 new helper functions, ~10 modified functions (see above) |
| `src/compiler/diagnosticMessages.json` | TS2900 diagnostic (reserved for future kind errors) |

### Test files

- `tests/cases/compiler/higherKindedTypesBasic.ts` — happy-path tests (Functor, Monad, Array, Box, lift, when, sequence)
- `tests/cases/compiler/higherKindedTypesErrors.ts` — error cases (arity mismatch, incorrect implementation, invariance)
- `tests/cases/compiler/higherKindedTypesSyntax.ts` — syntax variants (parens, multi-param, higher-order kinds)

## Design decisions

### Uncurried kind syntax

Unlike Haskell's curried `* -> * -> *`, we use explicit tuple syntax for
multi-parameter constructors: `(*, *) -> *`. This reflects that TypeScript
has no partial application of type constructors — you can't partially apply
`Map<K, V>` to fix `K` and get a `* -> *`.

The arrow is right-associative, so `* -> * -> *` means `* -> (* -> *)` —
a constructor that takes a `*` and returns a `* -> *`. This is a higher-order
kind and works correctly.

### Assignability of `F<A>` inside abstract bodies — invariant

When `F` is an abstract type constructor parameter, `F<A>` is assignable to `F<B>`
**only if `A` and `B` are mutually assignable**. This mirrors how ordinary type
parameters work today.

```typescript
// Error: Type 'A' is not assignable to type 'B'.
function bad<F : * -> *, A, B>(fa: F<A>): F<B> {
  return fa;
}

// OK — same type argument on both sides.
function fine<F : * -> *, A>(fa: F<A>): F<A> {
  return fa;
}
```

Invariance is the safe default. Covariant assumptions would be unsound for
contravariant type constructors (e.g., `type Predicate<A> = (a: A) => boolean`).

### Runtime semantics — pure erasure

`F` is a type-level construct only. It has no runtime presence, just like ordinary
type parameters. You cannot reference `F` in expression position.

## Next steps

### v0.1 — Error quality

- [ ] Kind mismatch errors when passing concrete types to HKT params
      (`Functor<number>` → `Type 'number' has kind '*', but kind '* -> *' is required`)
- [ ] Error when using bare `F` as a concrete type (`value: F` in an interface body)
- [ ] Custom diagnostic codes and messages (currently reuses generic TS diagnostics)

### v0.2 — Inference

- [ ] Multi-argument HKT inference (decompose `{ value: 1 }`
      into `Box<number>` to infer `A = number`)

### v0.3 — Polish

- [ ] Declaration emit (`.d.ts` with kind annotations)
- [ ] Language service: hover shows kind, completions offer constructors of right kind
- [ ] Type display: show `F<A>` instead of `F` in error messages and hover
- [ ] Edge cases: recursive types, conditional types with HKT params, mapped types

### Future

- Partial application of multi-param constructors
- Kind polymorphism (`<F : k -> *>`)
- Variance annotations on HKT params (`<F : * -> * out>`)
- Constraint combining (`<F : * -> * extends Iterable>`)
- JSDoc support

## Success criteria

**PASSING.** The following program typechecks and the inferred types are correct:

```typescript
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

interface Monad<F : * -> *> extends Functor<F> {
  pure<A>(a: A): F<A>;
  flatMap<A, B>(fa: F<A>, f: (a: A) => F<B>): F<B>;
}

type Box<A> = { value: A };

const boxMonad: Monad<Box> = {
  map: (fa, f) => ({ value: f(fa.value) }),
  pure: (a) => ({ value: a }),
  flatMap: (fa, f) => f(fa.value),
};

function sequence<F : * -> *, A>(monad: Monad<F>, list: F<A>[]): F<A[]> {
  return list.reduce(
    (acc, fa) => monad.flatMap(acc, (arr) => monad.map(fa, (a) => [...arr, a])),
    monad.pure([] as A[]),
  );
}

// inferred: Box<number[]>
const result = sequence(boxMonad, [{ value: 1 }, { value: 2 }, { value: 3 }]);
```
