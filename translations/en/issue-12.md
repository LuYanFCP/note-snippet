---
title: "Fenwick Tree (Binary Indexed)"
title_zh: "树状数组（Binary Indexed）"
source_hash: "14be1f75f3cd419920862473723a34e2c3e5486f97b3bc5f9dd0f3ae8ce27ec8"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-01T15:25:01Z"
issue_number: 12
translated_blocks: 9
---

> First, many thanks to the Bilibili creator 鹤翔万里 for the video; I recommend watching https://www.bilibili.com/video/av69667943?from=search&seid=10916758362943551299. This article is a summary I wrote for the 算法笔记 collection accompanying that video.

Problem setup: given an array of length `n`, support the following two operations

1. Output the sum of every number in the interval `[x, y]`
2. Add `k` to the `x`-th number

The most basic algorithm:

1. Maintain an array `sum`, where `sum[i]` stores the sum from 0 to i. Its recurrence relation is `sum[i] = sum[i-1] + nums[i]`, where `sum[0] = nums[0]`.
2. The interval sum can then be computed using `sum_xy = sum[y] - sum[x-1]`.
3. To add `v` to the `x`-th number, since all values of `sum[x]...sum[n]` must be updated, the time complexity is $O(n)$
4. If `k` operations are performed, `add`, then the time complexity is $O(kn)$, and the time complexity of `k` interval-sum queries is $O(k)$

In many scenarios with frequent updates, the $O(kn)$ time complexity is unacceptable.

So the Fenwick tree (binary indexed tree) is introduced to solve this problem.

Fenwick tree (Binary Indexed Tree): point update $O(logn)$, range query $O(logn)$, so the speed for many updates and queries within a range is $O(klogn)$

## LowBit Operation

For a non-negative integer n, the value formed by the lowest 1 in its binary representation together with the zeros after it.
For example:
$$lowbit(20) = lowbit(10100) = (100) = 4$$

How does it work:

C++ code

```c++
int lowbit(unsigned int n) {
    /**
     *  10100  20
     *  01100  two's complement of 20
     * &------
     *  00100->lowbit
    */
    unsigned int complement_n = ~n + 1; // To get two's complement, if it's an int just use -n
    return n & complement_n; 
}
// or

int lowbit(int n) {
    return n & (-n)
}

```

Python code

```python
def lowbit(n):  # lambda n: n & (-n)
    return n & (-n)
```

## Fenwick Tree (Binary Indexed)

A Fenwick tree still uses an array similar to `sum` to maintain some sum information (t), but `t[i]` does not maintain the sum of the first i numbers — it maintains the integer sum of `lowbit(i)` starting before position i (inclusive of i). Clearly `t[i]` covers a length of `lowbit(i)`.

**Note!: the index of a Fenwick tree always starts from 1**

<img width="1062" height="583" alt="Image" src="https://github.com/user-attachments/assets/f59a18ab-714f-4566-b8fc-f8979934090e" />

where

+ t[1] = A[1]
+ t[2] = A[1] + A[2]
+ t[3] = A[3]
+ t[4] = A[1] + A[2] + A[3] + A[4]
+ t[5] = A[5]
+ t[6] = A[5] + A[6]
+ t[7] = A[7]
+ t[8] = A[1] + A[2] + A[3] + A[4] + A[5] + A[6] + A[7] + A[8]
...

and so on

Now look back at the two problems mentioned earlier:

1. add(x, k): add a value k to the x-th number. According to the definition of a Fenwick tree, after the `A[x] += k` operation, all `t` nodes that contain `A[x]` must be updated.

One property stands out:

<img width="916" height="469" alt="Image" src="https://github.com/user-attachments/assets/693321c5-ccb8-47ee-93b7-4b874a20c9d2" />

that is, the parent of `t[x]` is `t[x+lowbit(x)]`, and the parent of `A[x]` is `t[x]`

So to update all nodes containing `A[x]`, we just keep updating the parent of `A[x]` until we reach the last parent.

```c++
void add(x, k) {
    for (; x <= n; x += lowbit(x)) t[x] += k;
}
```

2. ask(x): get the sum of `A[]` over indices from `1` to `x`:

Since the `t[x]` mentioned above contains the numbers marked from `x` to `x-bitlow(x)`, we have `ask(x) = t[x] + ask(x - bitlow(x))`, with the termination condition `x == 0`

```c++
int ask(x) {
    int ans = 0;
    for (; x > 0; x -= lowbit(x)) ans += t[x];
}
```

### 2D Fenwick Tree

`add` function design

```c++
void add(int x, int y, int k) {
    for (; x <= n; x += lowbit(x)) {
        for (; y <= n; y += lowbit(y)) {
            t[x][y] += k;
        }
    }
}
```

`ask` function design

```c++
int ask(int x, int y) {
    int ans = 0;
    for (; x; x -= lowbit(x))
        for (; y; y-= lowbit(y))
            ans += t[x][y]
    return ans;
}
```

### Range Update, Point Query

Problem:
1. Design a point query that returns `A[x]`
2. Design a range update that adds `k` to every value in `A[1]~A[x]`

The original definition of a Fenwick tree no longer suffices, because the `add` operation becomes especially complicated under the original Fenwick tree.

**So we introduce the difference array `b`, then use a Fenwick tree `t` to maintain its prefix sums.**

Below is an introduction to `oi-wiki` (https://oi-wiki.org/basic/prefix-sum/)

> A difference array is a strategy that is the counterpart of prefix sums.
> The strategy is to let $b_i = a_i - a_{i-1}$, i.e. the difference of two adjacent numbers.
> It is easy to see that taking the prefix sum of this sequence once recovers the original sequence $a$.
> It can maintain adding a number to a range of the sequence multiple times, and at the end query the value at some position, or query some position multiple times. (In short, update operations must always come before query operations.)
> How exactly does it work? For example, to add $b_l := b_l + k$ to every number in $[l, r]$, that is $b_{r+1} := b_{r+1} - k$. Then just take the prefix sum once at the end.

Concretely, if we maintain the difference array, then $b_l = A_l - A_{l-1} = A_l + k - (A_{l-1} + k) $ gives $b_l + k = A_l + k - A_{l+1}$.

Therefore:

+ A point query is just performing the following operation on the array maintained by `t`: `a[x] + ask(x)`
+ A range update is just performing the following operation on the array maintained by `t`: `add(1, d); add(x+1, -d)`

### Range Update, Range Query

For range update and range query, we can also solve it using the difference approach, except that what we use is the difference of the prefix sum.

First, consider the difference `A` of the array $b_{i}$, then the difference of the prefix sum

$$\sum_{i=1}^{x} a_{i} - \sum_{i=1}^{x-1} a_{i} = a_{i} - a_{i - 1} + a_{i-i} - a{i-2} .... + a_{2} - a_{1} + a{1} = b_{i} + b_{i-1} + ... + b_{1} = \sum_{i=1}^{x}b_{i}$$

The prefix sum of the difference of the prefix sum

$$\sum_{i=1}^{x}\sum_{j=1}^{i} b_{j}$$

Use a Fenwick tree to maintain the prefix sum of the difference of the prefix sum

<img width="925" height="557" alt="Image" src="https://github.com/user-attachments/assets/d807e763-86e1-4b7e-a235-2458120097be" />

But as in the figure above, to make the computation easier, we introduce another Fenwick tree to store $\sum_{i=1}^{x} i \times b_{i}$

### Code

`t1` maintains the prefix sum of `b[i]`, `t2` maintains the prefix sum of `i*b[i]`

Add `d` to the range `[l, r]`

```c++
// t1
add1(l, d)
add1(r+1, -d)
// t2
add2(l, l*d)
add2(r+1, -(r+1)*d) 
```

Query the sum over the range `[l, r]`
```c++
ans = (sum[r] + (r+1) * ask1(r) - ask2(r)) - (sum[l-1] +  l*ask(l-1) - ask2(l-1))
```

### Further Extensions

The values maintained by a Fenwick tree are not limited to sums; they can also be information such as maximums and minimums. The array can be extended like this

Its core is the maintenance of prefix interval sums.

### Applications of a Fenwick tree

1. Counting inversions or counting elements in order (Jianzhi Offer [No.51](https://leetcode-cn.com/problems/shu-zu-zhong-de-ni-xu-dui-lcof/)).
2. Finding the `k`-th largest number in a sequence (Leetcode No.215 Kth Largest Element in an Array) — a classic problem that needs a hashed prefix or suffix sum.
3. Leetcode 218. The Skyline Problem
And so on...

References
------
1. Highly recommended!!!!!!!! https://www.bilibili.com/video/av69667943?from=search&seid=10916758362943551299 
2. *Notes on Algorithms*
3. https://oi-wiki.org/basic/prefix-sum/
