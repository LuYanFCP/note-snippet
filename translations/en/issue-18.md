---
title: "[Python Basics] Namespaces, Scope, and Closures"
title_zh: "[Python基础] 命名空间、作用域以及闭包"
source_hash: "b351fe7a448e7e2f3df1c378453e0586b45a368c825f51b3ce8aad76624c2621"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-02T05:26:00Z"
issue_number: 18
translated_blocks: 10
---

> A namespace is a **mapping** from names to objects. Most namespaces are currently implemented as Python dictionaries, but that's normally not noticeable in any way (except for performance), and it may change in the future.

Namespaces are an important structure for avoiding name collisions. Namespaces are dynamic: they come into being as the interpreter executes, and they are maintained throughout the life of the program.

Namespaces:

+ Built-in namespace: the namespace that comes with the Python interpreter as soon as it starts, and stops when the Python interpreter ends.
+ Global namespace: the set of global names of a Python module — names defined directly in the module, such as classes, functions, other imported modules, and so on. Destroyed when the interpreter exits.
+ Local namespace: the namespace inside a function or a class. It is created when a function is called, and deleted when the function returns or raises an error that is not handled inside the function.
+ The attribute namespace of an object
+ Class namespace

# Scope

A *scope* is a **textual region** of a Python program where a namespace is directly accessible. "Directly accessible" here means that an unqualified reference to a name attempts to find the name in the namespace.

Scopes are determined statically (textual region), but used dynamically (namespace). At any time during execution, there are at least three nested scopes whose namespaces are directly accessible:

+ The innermost scope, which is searched first, contains the local names (local)
+ The scopes of any enclosing functions, which are searched starting with the nearest enclosing scope, contain non-local, but also non-global names (enclosing)
+ The next-to-last scope contains the current module's global names (global)
+ The outermost scope (searched last) is the namespace containing built-in names (built-in)

Scope resolution in Python, like in other languages, follows the nearest-first principle: namespaces are searched from near to far, in the order Local -> Enclosing Local -> Global -> built-in.

## local (local namespace)

The local namespace is the namespace inside a function or a class. It is created when a function is called, and deleted when the function returns or raises an error that is not handled inside the function.

```python
def hello():
    _str = "hello world"  # local local name
    print(_str)
    return _str
```

## Enclosing Local

The enclosing search also happens within the local scope, searching from the inside out according to the nesting level, covering the scope of any enclosing function that contains nonlocal, nonglobal names. For example, with two nested functions, the inner function's scope is the local scope, and the outer function's scope is the inner function's enclosing scope.

For example:

```python
def hello():
    _str = "hello world"
    a = 1
    nonlocal b = 2
    def say():
        print(a)  # 1
        # a += 2  # error, cannot modify
        a = 3 # local variable shadows the outer function's variable
        b += 3  # ok can pass

    print(a)  # 1
    print(b)  # 5
    return say
```

In the example above, the inner function `c` first looks in its own `local` when `print(a)` is called, doesn't find it there, so it looks in the next layer out, finds a, and prints it.

When `a += 2` executes, the search path is the same, but `a` is not a nonlocal variable (there's no keyword declaring it `nonlocal`), **it can only be accessed, not modified. Free variables can only be accessed, not modified.**

When `a = 3` executes, it uses a local variable to shadow the outer function's variable. So in the end `print(a)` outputs 1.

`b+=3` executes successfully, `b` is a nonlocal variable and can be modified.

## global (global names)

For example

```python
a = 1
def hello():
    print(a) # accessible
    a += 1  # error
```

> If a name is declared **global**, **then all references and assignments go directly to the middle scope containing the module's global names**. To rebind variables found outside the innermost scope, the nonlocal statement can be used to declare them as non-local. If they are not declared non-local, those variables are read-only (attempting to write to such a variable simply creates a *new* local variable in the innermost scope, leaving the identically named outer variable unchanged).

If you want to modify a global variable, you need to declare it with `global`, which binds the global variable to that scope.

## Built-in (the namespace of built-in names)

> The namespace containing the built-in names is created when the Python interpreter starts up, and is never deleted. The global namespace for a module is created when the module definition is read in; normally, module namespaces also last until the interpreter quits. The statements executed by the top-level invocation of the interpreter, either read from a script file or interactively, are considered part of a `__main__` module call, so they have their own global namespace. (The built-in names actually also live in a module; this module is called builtins.)

This namespace is created when the `python` interpreter starts up, and destroyed when it exits.

## Introducing scope

`Built-in` and `Gobal` are generally the default, loaded at startup, while `Enclosing Local` and `Local` are loaded dynamically.

When is a scope introduced:

+ A function introduces `Local` or `Enclosing Local`; `lambda` and `generator` are also functions.
+ A class introduces `local`
+ A list comprehension introduces `local`

When is a scope not introduced:

+ The `if` statement
+ The `for` statement also does not introduce a new scope
```python
for i in range(10):
    print(i)
print(i) # Still ok
```

## Free Variables

A free variable is a variable that can be reached from another scope through the lookup rules, but is not bound to the current scope.

The key point: free variables can be read but not modified.

```python
i = 0
def add(n):
    print(i) # OK
    # i += n # not allowed
```

You need `gobal` and `nonlocal` to bind the variable to the current scope, and only then can you modify it. `gobal` binds a global variable, while `nonlocal` binds a `local` variable.

# Closures

**A closure is a function that extends its scope, containing non-global variables that are referenced in the function body but not defined there. A closure is a function that retains the bindings of the free variables that existed when the function was defined, so that when the function is called, those bindings can still be used even though the defining scope is no longer available.**

## A Simple Example

Suppose there is a function `avg` whose job is to continuously compute the mean of a series of values; for example, the average closing price over the entire history, where a new price is added every day, so the average must take into account all prices up to the present.

For example

```python
avg(10)
10.0
avg(11)
10.5
avg(12)
11.0
```

Where does avg come from, and where does it store the historical values? To implement it, we build a simple version of `class`

```python
class Averager():
    def __init__(self):
        self.series = []

    def __call__(self, new_value):
        self.series.append(new_value)
        total = sum(self.series)
        return total / len(self.series)

>> avg = Averager()
>> avg(10)
10.0
>> avg(11)
10.5
>> avg(12)
11.0
```

We can likewise implement it using a higher-order function

```python
def Averager():
    series = []
    def averager(new_value):
        series.append(new_value)
        total = sum(series)
        return total / len(series)
    return averager

>> avg = Averager()
>> avg(10)
10.0
>> avg(11)
10.5
>> avg(12)
11.0
```

Note that when using the higher-order function, `series` is a local variable of `Averager`, but by the time avg is obtained, `Averager` has already gone out of scope, and the local scope has already disappeared. At this point the scope of the inner `averager` function gains one more free variable `series`, that is, `averager` extends beyond its own function scope.

```python
In [9]: avg.__code__.co_varnames
Out[9]: ('new_value', 'total')

In [10]: avg.__code__.co_freevars
Out[10]: ('series',)
```

Here `series` is bound to the `__closure__` attribute of the returned avg function. These elements are `cell` objects, which have a `cell_contents` attribute holding the real value. Therefore `avg` is a closure.

References
-----
https://docs.python.org/zh-cn/3/tutorial/classes.html#python-scopes-and-namespaces

https://www.cnblogs.com/crazyrunning/p/6914080.html

《Fluent Python》
