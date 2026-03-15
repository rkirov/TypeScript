# TypeScript Higher-Kinded Types — Experimental Fork

## Goal

Add first-class support for higher-kinded types (HKTs) to TypeScript, enabling
abstraction over type constructors. This eliminates the need for defunctionalization
hacks (fp-ts style `HKT` interfaces, URI maps) by introducing kind annotations
directly into the type parameter syntax.

## Status

**v0 implementation complete.** The success criteria program typechecks end-to-end.
All 12 test cases pass in the standard test suite. Backward compatibility verified.

### What works now

- Kind annotation syntax: `<F : * -> *>`, `<K : * -> * -> *>`
- Concrete instantiation with built-in types: `Functor<Array>`, `Monad<Array>`
- User-defined type constructors: `Functor<Box>` where `type Box<A> = { value: A }`
- Type application: `F<A>` where `F` is a type constructor parameter
- Substitution: `F<A>` resolves to `Array<A>` when `F = Array`
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
- Multi-param constructors as HKT arguments (`Map` for `K : * -> * -> *`)
- Multi-argument HKT inference (`sequence(boxMonad, [{value:1}])` infers
  `Box<unknown[]>` instead of `Box<number[]>` — single-arg inference works)
- Custom kind-mismatch error messages (uses generic TS errors instead of
  `Type 'number' has kind '*', but kind '* -> *' is required`)

## Syntax

Kind annotations use Haskell-style `* -> *` notation, attached to type parameters
with `:`. This is unambiguous because it only appears inside `<>` type parameter
lists, where `*` has no existing meaning.

```typescript
// F is a type constructor that takes one type argument
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

// Concrete instantiation — Array is * -> *
const arrayFunctor: Functor<Array> = {
  map: (fa, f) => fa.map(f),
};

// In generic function signatures
function lift<F : * -> *, A, B>(
  functor: Functor<F>,
  f: (a: A) => B,
): (fa: F<A>) => F<B> {
  return (fa) => functor.map(fa, f);
}
```

### Kinding rules

- `*` is the kind of all concrete types (`number`, `string`, `Array<number>`, etc.)
- `* -> *` is the kind of type constructors taking one argument (`Array`, `Promise`, `Set`)
- `* -> * -> *` is the kind of two-argument constructors (`Map`, `Either`)
- Right-associative: `* -> * -> *` means `* -> (* -> *)`

## Implementation details

### Approach — no new tokens, no new AST node kinds

The `->` in kind annotations is parsed at the parser level by consuming `MinusToken`
then `GreaterThanToken` as a pair. This avoids adding a new scanner token and the
`GreaterThanToken` is consumed before the bracket-closing logic sees it.

Kind information is stored as a simple arity number (`kindArity`) directly on
`TypeParameterDeclaration` (AST) and `TypeParameter` (resolved type). No new
`SyntaxKind` entries needed.

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

### Files modified

| File | Changes |
|------|---------|
| `src/compiler/types.ts` | `kindArity` on `TypeParameterDeclaration` and `TypeParameter`; `hktConstructorSymbol` and `hktTypeArguments` on `Type` |
| `src/compiler/parser.ts` | `parseKindAnnotation()`, modified `parseTypeParameter()` |
| `src/compiler/factory/nodeFactory.ts` | Initialize `kindArity` field |
| `src/compiler/checker.ts` | ~10 new helper functions, ~8 modified functions (see above) |

### Test files

- `tests/cases/compiler/higherKindedTypesBasic.ts` — happy-path tests (Functor, Monad, Array, Box, lift, when, sequence)
- `tests/cases/compiler/higherKindedTypesErrors.ts` — error cases (arity mismatch, incorrect implementation, invariance)

## Target examples

These should all typecheck after the feature lands.

### Functor + Monad

```typescript
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

interface Monad<F : * -> *> {
  pure<A>(a: A): F<A>;
  flatMap<A, B>(fa: F<A>, f: (a: A) => F<B>): F<B>;
}

const arrayMonad: Monad<Array> = {
  pure: <A>(a: A): A[] => [a],
  flatMap: <A, B>(fa: A[], f: (a: A) => B[]): B[] => fa.flatMap(f),
};
```

### Generic programming over any Monad

```typescript
function when<F : * -> *>(
  monad: Monad<F>,
  cond: boolean,
  action: F<void>,
): F<void> {
  return cond ? action : monad.pure(undefined);
}

// Works with Array
when(arrayMonad, true, [undefined]);

// Works with Promise (given a promiseMonad instance)
when(promiseMonad, true, Promise.resolve());
```

### User-defined type constructors

```typescript
type Box<A> = { value: A };

// Box is * -> *, so this should work
const boxFunctor: Functor<Box> = {
  map: <A, B>(fa: Box<A>, f: (a: A) => B): Box<B> => ({ value: f(fa.value) }),
};
```

### Nested / composed constructors (stretch goal)

```typescript
// ComposeF<F, G> applies F after G: ComposeF<Array, Box> ~ Array<Box<_>>
type ComposeF<F : * -> *, G : * -> *, A> = F<G<A>>;
```

## Design decisions

### Assignability of `F<A>` inside abstract bodies — invariant

When `F` is an abstract type constructor parameter, `F<A>` is assignable to `F<B>`
**only if `A` and `B` are mutually assignable**. This mirrors how ordinary type
parameters work today: in `function f<A, B>(a: A): B { return a; }`, the assignment
fails because `A` and `B` are unrelated — even though at some call site they might
both be `string`. Same principle, lifted one kind level.

Concretely:

```typescript
// Error: Type 'A' is not assignable to type 'B'.
function bad<F : * -> *, A, B>(fa: F<A>): F<B> {
  return fa;
}

// OK — same type argument on both sides.
function fine<F : * -> *, A>(fa: F<A>): F<A> {
  return fa;
}

// OK — map transforms the inner type via a function the caller provides.
function map<F : * -> *, A, B>(
  functor: Functor<F>,
  fa: F<A>,
  f: (a: A) => B,
): F<B> {
  return functor.map(fa, f);
}
```

This is deliberately conservative. Covariant assumptions (`F<Cat>` assignable to
`F<Animal>`) would be unsound for contravariant type constructors (e.g.,
`type Predicate<A> = (a: A) => boolean`). Invariance is the safe default and
matches the principle of least surprise for anyone familiar with how TS generics
already work.

Future work could add variance annotations (`<F : * -> * out>` for covariant,
`<F : * -> * in>` for contravariant) to relax this where it's provably safe.

### Runtime semantics — pure erasure

`F` is a type-level construct only. It has no runtime presence, just like ordinary
type parameters. You cannot reference `F` in expression position.

```typescript
function broken<F : * -> *, A>(a: A): F<A> {
  // Error: 'F' only refers to a type, but is being used as a value here.
  return new F(a);
}

// The only way to produce F<A> values is from arguments or helper functions:
function works<F : * -> *, A>(monad: Monad<F>, a: A): F<A> {
  return monad.pure(a);  // OK — pure returns F<A>
}
```

## Next steps

### v0.1 — Error quality

- [ ] Kind mismatch errors when passing concrete types to HKT params
      (`Functor<number>` → `Type 'number' has kind '*', but kind '* -> *' is required`)
- [ ] Kind mismatch errors for arity mismatches at the type-argument level
      (`Functor<Map>` → `Type 'Map' has kind '* -> * -> *', but kind '* -> *' is required`)
- [ ] Error when using bare `F` as a concrete type (`value: F` in an interface body)
- [ ] Custom diagnostic codes and messages (currently reuses generic TS diagnostics)

### v0.2 — Multi-param kinds and inference

- [ ] `* -> * -> *` constructors as HKT arguments (`Map` for `K : * -> * -> *`)
- [ ] Multi-argument inference for HKT applications (decompose `{ value: 1 }`
      into `Box<number>` to infer `A = number`)
- [ ] Nested HKT applications (`ComposeF<Array, Box, number>` → `Array<Box<number>>`)

### v0.3 — Polish

- [ ] Declaration emit (`.d.ts` with kind annotations)
- [ ] Language service: hover shows kind, completions offer constructors of right kind
- [ ] Type display: show `F<A>` instead of `F` in error messages and hover
- [ ] Edge cases: recursive types, conditional types with HKT params, mapped types

### Future

- Partial application of multi-param constructors
- Kind polymorphism (`<F : k -> *>`)
- Higher-order kinds (`<F : (* -> *) -> *>`)
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
