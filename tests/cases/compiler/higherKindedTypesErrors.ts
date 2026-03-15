// @strict: true
// @noEmit: true

interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

// Error: wrong number of type arguments to constructor param
interface BadArity<F : * -> *> {
  bar<A, B>(x: F<A, B>): void;  // F expects 1 arg, got 2
}

// Incorrect implementation of an HKT interface
const badArrayFunctor: Functor<Array> = {
  map: (fa, f) => f(fa[0]),  // returns B, not Array<B>
};

// Invariance: F<A> is not assignable to F<B>
function bad<F : * -> *, A, B>(fa: F<A>): F<B> {
  return fa;  // Error
}

// Same type argument on both sides is fine
function fine<F : * -> *, A>(fa: F<A>): F<A> {
  return fa;
}
