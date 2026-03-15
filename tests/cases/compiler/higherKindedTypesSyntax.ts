// @strict: true
// @noEmit: true

// Single-arg kind: * -> * (same as (*) -> *)
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

// Parenthesized single-arg kind: (*) -> * — identical to * -> *
interface Functor2<F : (*) -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

// Two-arg kind: (*, *) -> *
interface Bifunctor<F : (*, *) -> *> {
  bimap<A, B, C, D>(fa: F<A, B>, f: (a: A) => C, g: (b: B) => D): F<C, D>;
}

// Higher-order kind should error
interface Transform<F : (* -> *) -> *> {
  run(): F<number>;
}

// Concrete usage of two-arg kind
type Pair<A, B> = { fst: A; snd: B };

const pairBifunctor: Bifunctor<Pair> = {
  bimap: (fa, f, g) => ({ fst: f(fa.fst), snd: g(fa.snd) }),
};
