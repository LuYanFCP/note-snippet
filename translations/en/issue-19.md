---
title: "Inversions in an array"
title_zh: "数组中的逆序对"
source_hash: "3a48870ae0200610876a4fd729e3d6f45ead33dde63db08cdce3d249651136d9"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-01T15:24:59Z"
issue_number: 19
translated_blocks: 9
---

> Interview Question 51. Inversions in an Array
> Given two numbers in an array, if the earlier number is greater than the later one, the two numbers form an inversion. Given an array, find the total number of inversions in it.

Example 1:

```
Input: [7,5,6,4]
Output: 5
```
Constraints:
0 <= array length <= 50000

# Approach

## Brute-force solution

Just scan it mindlessly

```cpp
class Solution {
public:
    int reversePairs(vector<int>& nums) {
        if (nums.size() == 0)
            return 0;
        int sum = 0;
        for (int i = 0; i < nums.size() - 1; ++i) {
            for (int j = i+1; j < nums.size(); ++j) {
                if (nums[i] > nums[j])
                    sum++;
            }
        }
        return sum;
    }
};
```

Time complexity $O(n^2)$, space complexity $O(1)$

**Time limit exceeded!** Let's think about a new algorithm.

## Divide and Conquer

This problem has the classic hallmarks of divide and conquer:

1. The left and right halves are independent of each other, so it can be split into two subproblems.
2. The basic idea is: count the inversions in the left half + count the inversions in the right half + count the inversions that cross the boundary.

Define a function `_reversePairs` to implement divide and conquer; then the solution function is

```cpp
int _reversePairs(vector<int>& nums, int begin, int end);

int reversePairs(vector<int>& nums) {
    return _reversePairs(nums, 0, nums.size());
}

```

Now let's look inside the `_reversePairs` function.

Idea: count the inversions in the left half + count the inversions in the right half + count the inversions that cross the boundary, solved recursively.

1. Base case for the recursion: begin >= end terminates it.
2. Find the midpoint, recursively count the inversions on the left, recursively count the inversions on the right.
3. Count the inversions that cross the boundary.
4. Sum them up and return.

**The core of the algorithm is handling the count of inversions that cross the boundary.**

I noticed that both halves are unsorted. If they were sorted, we could speed up the cross-boundary inversion count.

That brings merge sort to mind, because merge sort leaves the left and right halves sorted. So let's use merge sort to solve this problem.

The concrete idea: during the merge, we need to compare values from the left and right sequences.

```cpp
#include <vector>
#include <iterator>
#include <iostream>
using std::vector;

class Solution {
public:
    int reversePairs(vector<int>& nums) {
        temp = new int[nums.size()];
        return _reversePairs(nums, 0, nums.size()-1);
    }

    int _reversePairs(vector<int>& nums, int begin, int end) {

        if (begin < end) {
            int mid = (end - begin)/2 + begin;
            int left_rp = _reversePairs(nums, begin, mid);  // Already sorted
            int right_rp = _reversePairs(nums, mid+1, end);
            // After both sides finish executing, it is already sorted
            int i = begin, j = mid+1, k = begin;
            int grap_rp = 0;
            while (i <= mid && j <= end) {
                if (nums[i] <= nums[j]) {
                    temp[k++] = nums[i++];
                    grap_rp += j - mid - 1;
                } else {
                    //  nums[i] > nums[j]
                    temp[k++] = nums[j++];
                }
            }

            //  1 3 5 7 9 <= mid
            //  4 5 6 8 10
            // 
            while (i <= mid) {
                temp[k++] = nums[i++];
                grap_rp += j - mid - 1;   
            }
            while (j <= end) temp[k++] = nums[j++];
            std::copy(temp+begin, temp+end+1, nums.begin()+begin);
            // std::copy(temp+begin, temp+end+1, std::ostream_iterator<int>(std::cout, " "));
            // std::cout << std::endl;
            // std::cout << "left_rp: " << left_rp << " right_rp: " << right_rp << " grap_rp: " << grap_rp << endl;
            return left_rp + right_rp + grap_rp;
        } else {
            return 0;
        } 

    }
private:
    int *temp;
};
```

After running it, the result is:

Runtime:

+ 148 ms, beating 92.74% of users across all C++ submissions
+ Memory usage: 47.1 MB, beating 100.00% of users across all C++ submissions

## Solving with a hash

Build a hashtable to record the number of times the number `x` appears. So to count inversions, we compute the sum of the hashtable values for the current number `v` through the end `n`. This way we traverse the sequence once, giving a time complexity of $O(n\*K)$, where `K` is the maximum value (since if the hashtable is to hold all values, it must have an index for every value). If K is very large, the computational complexity is unacceptable. So we introduce discretization: sort the numbers in `nums` from smallest to largest, remove duplicates, then use a hashmap to index each number, with its index being `1~n`. This brings the time complexity down to $O(n\*2)$, the same as the brute-force method, which is also unacceptable.

So to simplify the computation of the sum of the hashtable values, we introduce a Fenwick tree (binary indexed tree) to solve this problem, which can reduce the time complexity to $O(nlogn)$.

## Fenwick tree (BIT)

For the specific definition and usage of a Fenwick tree, see my other article []()

The core of this method is a Fenwick tree + coordinate compression

### Discretization

Discretization is used to handle the problem where using a Fenwick tree (binary indexed tree) can cause the hash array to become too long

```c++
vector<int> vec_elem;
std::copy(nums.begin(), nums.end(), std::back_insert_iterator(vec_elem));
sort(vec_elem.begin(), vec_elem.end());
// Remove duplicates
vec_elem.erase(unique(vec_elem.begin(), vec_elem.end), vec_elem.end());
// Discretization operation
int count = 1;  // Mark count
unordered_map<int, int> hashmap;
for (int elem : vec_elem) {
    hashmap[elem] = count++;
}
```

Convert a sequence of increasing numbers into labels from 1 to n

The discretization operation is only suitable for offline computation, not for online computation.

### Fenwick tree

For a detailed explanation, see my Fenwick tree summary. [Fenwick tree](https://www.cnblogs.com/luyanfcp/articles/12457039.html)

Build a Fenwick tree to count, for each position, how many of the numbers before `x` are greater than the number at position `x`. The Fenwick tree records, at each index, the count of the number `x`.

```c++
vector<int> t(n + 1);
int ans = 0;
for (int i = 0; i < nums.size(); ++i) {
    add(hashmap[nums[i]], t);
    ans += (i+1) - ask(hashmap[nums[i]], t);  // forward number + reverse number = i+1
}
return ans;
```

### All the code

+ Runtime: 208 ms, beats 66.29% of users across all C++ submissions
+ Memory usage: 61.1 MB, beats 100.00% of users across all C++ submissions

```c++
#include <vector>
#include <algorithm>
#include <unordered_map>
#include <iterator>

using std::vector;
using std::sort;
using std::unique;
using std::unordered_map;

class Solution {
public:
    int lowbit(int x) {
        return x & (-x);
    }
    void add(int x, vector<int>& t) {
        int n = t.size() - 1;
        for (; x <= n; x += lowbit(x)) t[x] += 1;  
    }
    int ask(int x, vector<int>& t) {
        int res = 0;
        for (; x > 0; x -= lowbit(x)) res += t[x];
        return res;
    }
    int reversePairs(vector<int>& nums) {
        int n = nums.size();
        // Discretization operation
        vector<int> vec_elem;
        std::copy(nums.begin(), nums.end(), std::back_insert_iterator(vec_elem));
        sort(vec_elem.begin(), vec_elem.end());  // Remove duplicates
        vec_elem.erase(unique(vec_elem.begin(), vec_elem.end()), vec_elem.end());  
        int count = 1;  // Mark count
        unordered_map<int, int> hashmap;
        for (int elem : vec_elem) {
            hashmap[elem] = count++;
        }
        vector<int> t(n + 1);
        int ans = 0;
        for (int i = 0; i < nums.size(); ++i) {
            add(hashmap[nums[i]], t);
            ans += (i+1) - ask(hashmap[nums[i]], t);
        }
        return ans;
    }
};
```
