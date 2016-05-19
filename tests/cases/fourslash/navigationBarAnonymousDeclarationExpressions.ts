/// <reference path="fourslash.ts" />

////global.cls = class { };
////(function() {
////    const x = () => {
////        // Presence of inner function causes x to be a top-level function.
////        const xx = function() {}
////    };
////    const y = {
////        // This is not a top-level function (contains nothing, but shows up in childItems of its parent.)
////        foo: function() {}
////    };
////    (function nest() {
////        function moreNest() {}
////    })();
////})();
////(function() { // Different anonymous functions are not merged
////    These will only show up as childItems.
////    function z() {}
////    console.log(function() {})
////})
////(function classes() {
////    // Classes show up in top-level regardless of whether they have names or inner declarations.
////    const cls2 = class { };
////    console.log(class cls3 {});
////    (class { });
////})

verify.navigationBarCount(24);
verify.navigationBarIndex("<global>", 0);
verify.navigationBarIndex("<function>", 1);
verify.navigationBarIndex("x", 2);
verify.navigationBarIndex("nest", 3);
verify.navigationBarIndex("<function>", 4);
verify.navigationBarIndex("global.cls", 5);
verify.navigationBarIndex("classes", 6);
verify.navigationBarIndex("cls2", 7);
//TODO: why the odd sorting?
verify.navigationBarIndex("<class>", 8);
verify.navigationBarIndex("cls3", 9);

verify.navigationBarContains("global.cls", "class");

verify.navigationBarChildItem("<function>", "x", "const");
verify.navigationBarChildItem("x", "xx", "const");
verify.navigationBarChildItem("<function>", "y", "const");
verify.navigationBarChildItem("y", "foo", "const");
verify.navigationBarChildItem("<function>", "nest", "function");
verify.navigationBarChildItem("nest", "moreNest", "function");

verify.navigationBarChildItem("classes", "cls2", "const");
verify.navigationBarChildItem("classes", "cls3", "class");
verify.navigationBarChildItem("classes", "<class>", "class");

/*
verify.navigationBarCount(18);
verify.navigationBarIndex("<global>", 0);
verify.navigationBarIndex("<function>", 1);
verify.navigationBarIndex("x", 2);
verify.navigationBarIndex("foo", 3);
verify.navigationBarIndex("expr", 4);
verify.navigationBarIndex("<function>", 5);
verify.navigationBarIndex("z", 6);
verify.navigationBarIndex("global.cls", 7);
verify.navigationBarIndex("classes", 8);
verify.navigationBarIndex("cls2", 9);
verify.navigationBarIndex("cls3", 10);


verify.navigationBarContains("<function>", "function");
verify.navigationBarChildItem("<function>", "x", "const");
verify.navigationBarChildItem("<function>", "y", "const");
verify.navigationBarChildItem("<function>", "expr", "function");

verify.navigationBarChildItem("classes", "cls2", "const");
verify.navigationBarChildItem("classes", "cls3", "class");
*/
