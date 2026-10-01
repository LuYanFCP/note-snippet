---
title: "Python Basics: Decorators"
title_zh: "[Python基础] 装饰器"
source_hash: "2ccb7cbeedfaedd4e79b2986ef9f8ba0bc66f911a33f4d5737777e655ef65a34"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-01T15:24:59Z"
issue_number: 17
translated_blocks: 3
---

A decorator is a callable object whose argument is another function (the decorated function). The decorator may process the decorated function and then return it, or replace it with another function or callable object.

```python
@test
def target():
    print("run target function!")
```

It works the same as the following code

```python
def target():
    print("run target function!")
target = test(target) # In the test function, the function will be enhanced or replaced
```

Function decorators run at import time, while the decorated function only runs when it is explicitly called.

Python does not require variable declarations, but it assumes that a variable assigned to inside a function body is a local variable. This is far better than the behavior of `javascript`; `javascript` also does not require variable declarations, but if you forget to declare a variable as local (using var), you may end up accessing a global variable without realizing it.

## An example of a decorator --- logging program runs

Goal: every time the program runs, output `log`, output the program's runtime, results, and so on, and write `log` to `terminal`.

```python
import time
def log(func):
    def ff(*args, **kwargs):
        t0 = time.time()
        run_time = time.asctime(time.localtime(t0))
        res = func(*args, **kwargs)
        cost = time.time() - t0
        name = func.__name__
        args_str = ', '.join(repr(arg) for arg in args)  # Convert repr into a human-readable form
        print('[{}] {}({})->{} cust_time={} s'.format(run_time, name, args_str, res, cost))
        return res
    return f

@log
def f(n):
    if n <= 1:
        return 1
    return n * f(n-1)

>> f(5)
[Fri Mar 20 16:04:05 2020] f(1)->1 cust_time=0.0 s
[Fri Mar 20 16:04:05 2020] f(2)->2 cust_time=0.0 s
[Fri Mar 20 16:04:05 2020] f(3)->6 cust_time=0.000997304916381836 s
[Fri Mar 20 16:04:05 2020] f(4)->24 cust_time=0.000997304916381836 s
[Fri Mar 20 16:04:05 2020] f(5)->120 cust_time=0.000997304916381836 s
120
```

The example above implements this functionality, but it isn't complete yet, because it doesn't support keyword arguments, and it also masks attributes of the decorated function such as `__name__` and `__doc__`. Bring in `functools.wraps` to help the decorator.

```python
def log(func):
    @functools.wraps(func)
    def f(*args, **kwargs):
        t0 = time.time()
        run_time = time.asctime(time.localtime(t0))
        res = func(*args, **kwargs)
        cost = time.time() - t0
        name = func.__name__
        args_str = ', '.join(repr(arg) for arg in args)  # Convert repr into a human-readable form
        print('[{}] {}({})->{} cust_time={} s'.format(run_time, name, args_str, res, cost))
        return res
    return f
```

## Parameterized decorators

We'll often see `wrap` taking parameters to help out, like

```python
from functools import lru_cache
@lru_cache(max_size=16)
def f(n):
    if n <= 1:
        return 1
    return n * f(n-1)
```

which is equivalent to

```python
f = lru_cache(max_size=16)(f)
```

So if you want to add parameters, you have to add another layer to the `wraper` function. Still using the example above, in this case you can treat `fmt` as a parameter:

```python
import functools, time
fmt='[{}] {}({})->{} cust_time={} s'
def log(fmt):
    def log_f(func):
        @functools.wraps(func)
        def f(*args, **kwargs):
            t0 = time.time()
            run_time = time.asctime(time.localtime(t0))
            res = func(*args, **kwargs)
            cost = time.time() - t0
            name = func.__name__
            args_str = ', '.join(repr(arg) for arg in args)  # Convert repr into a human-readable form
            print(fmt.format(run_time, name, args_str, res, cost))
            return res
        return f
    return log_f
```

References
-----------
《Fluent Python》
