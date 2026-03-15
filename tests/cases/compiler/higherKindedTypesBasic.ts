// @strict: true
// @noEmit: true

// Basic HKT interfaces
interface Functor<F : * -> *> {
  map<A, B>(fa: F<A>, f: (a: A) => B): F<B>;
}

interface Monad<F : * -> *> extends Functor<F> {
  pure<A>(a: A): F<A>;
  flatMap<A, B>(fa: F<A>, f: (a: A) => F<B>): F<B>;
}

// Concrete instantiation — Array
const arrayFunctor: Functor<Array> = {
  map: (fa, f) => fa.map(f),
};

const arrayMonad: Monad<Array> = {
  map: (fa, f) => fa.map(f),
  pure: <A>(a: A): A[] => [a],
  flatMap: <A, B>(fa: A[], f: (a: A) => B[]): B[] => fa.flatMap(f),
};

// User-defined type constructor
type Box<A> = { value: A };

const boxFunctor: Functor<Box> = {
  map: (fa, f) => ({ value: f(fa.value) }),
};

const boxMonad: Monad<Box> = {
  map: (fa, f) => ({ value: f(fa.value) }),
  pure: (a) => ({ value: a }),
  flatMap: (fa, f) => f(fa.value),
};

// Generic programming over any Monad
function when<F : * -> *>(monad: Monad<F>, cond: boolean, action: F<void>): F<void> {
  return cond ? action : monad.pure(undefined);
}
when(arrayMonad, true, [undefined]);
when(boxMonad, true, { value: undefined });

// Generic lift function
function lift<F : * -> *, A, B>(functor: Functor<F>, f: (a: A) => B): (fa: F<A>) => F<B> {
  return (fa) => functor.map(fa, f);
}

// Direct method calls with inference
const r1: Box<number> = boxMonad.pure(42);
const r2: Box<number> = boxMonad.flatMap({ value: 1 }, x => ({ value: x + 1 }));
const r3: string[] = arrayMonad.pure("hello");

// Sequence — success criteria from design doc
function sequence<F : * -> *, A>(monad: Monad<F>, list: F<A>[]): F<A[]> {
  return list.reduce(
    (acc, fa) => monad.flatMap(acc, (arr) => monad.map(fa, (a) => [...arr, a])),
    monad.pure([] as A[]),
  );
}
const result = sequence(boxMonad, [{ value: 1 }, { value: 2 }, { value: 3 }]);
