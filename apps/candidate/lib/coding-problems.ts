// Problem definitions for B_CODING and B_DEBUG stages.
// `testFiles` are hidden from the candidate; written into /work by the sandbox worker.

export type Language = 'python' | 'node';

export interface CodingProblem {
  id: string;
  stageKey: 'B_CODING' | 'B_DEBUG';
  title: string;
  description: string;
  language: Language;
  starterCode: string;
  testFiles: Array<{ path: string; content: string }>;
  testCmd: string[];
  timeoutMs: number;
  memoryMb: number;
}

// ── B_CODING: Two Sum ────────────────────────────────────────────────────────

const TWO_SUM_TESTS = `\
import pytest
from solution import two_sum

def test_basic():
    assert sorted(two_sum([2, 7, 11, 15], 9)) == [0, 1]

def test_mid():
    assert sorted(two_sum([3, 2, 4], 6)) == [1, 2]

def test_duplicate():
    assert sorted(two_sum([3, 3], 6)) == [0, 1]

def test_negative():
    assert sorted(two_sum([-3, 4, 3, 90], 0)) == [0, 2]

def test_large():
    nums = list(range(1000))
    result = sorted(two_sum(nums, 1997))
    assert result == [998, 999]
`;

export const B_CODING_PROBLEM: CodingProblem = {
  id: 'two_sum',
  stageKey: 'B_CODING',
  title: 'Two Sum',
  description: `Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers such that they add up to \`target\`.

You may assume that each input has exactly one solution, and you may not use the same element twice. You can return the answer in any order.

**Examples**

| Input | Output |
|-------|--------|
| \`nums = [2, 7, 11, 15]\`, \`target = 9\` | \`[0, 1]\` |
| \`nums = [3, 2, 4]\`, \`target = 6\` | \`[1, 2]\` |
| \`nums = [3, 3]\`, \`target = 6\` | \`[0, 1]\` |

**Constraints**
- \`2 ≤ nums.length ≤ 10⁴\`
- \`−10⁹ ≤ nums[i] ≤ 10⁹\`
- Exactly one valid answer exists.

**Time limit:** 90 seconds`,
  language: 'python',
  starterCode: `def two_sum(nums: list[int], target: int) -> list[int]:
    """
    Return the indices of the two numbers that add up to target.
    """
    # Your solution here
    pass
`,
  testFiles: [{ path: 'test_solution.py', content: TWO_SUM_TESTS }],
  testCmd: ['python', '-m', 'pytest', 'test_solution.py', '-v', '--tb=short', '--no-header'],
  timeoutMs: 30_000,
  memoryMb: 256,
};

// ── B_DEBUG: Fix the Binary Search ──────────────────────────────────────────

const BINARY_SEARCH_BUGGY = `def binary_search(arr: list[int], target: int) -> int:
    """
    Search for target in a sorted array.
    Returns the index if found, or -1 if not found.
    """
    left, right = 0, len(arr)          # Bug 1 is somewhere in here
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid + 1            # Bug 2 is somewhere in here
    return -1
`;

const BINARY_SEARCH_TESTS = `\
import pytest
from solution import binary_search

def test_found_middle():
    assert binary_search([1, 3, 5, 7, 9], 5) == 2

def test_found_first():
    assert binary_search([1, 3, 5, 7, 9], 1) == 0

def test_found_last():
    assert binary_search([1, 3, 5, 7, 9], 9) == 4

def test_not_found():
    assert binary_search([1, 3, 5, 7, 9], 4) == -1

def test_single_element_found():
    assert binary_search([42], 42) == 0

def test_single_element_not_found():
    assert binary_search([42], 7) == -1

def test_large():
    arr = list(range(0, 200, 2))   # [0, 2, 4, ..., 198]
    assert binary_search(arr, 100) == 50
    assert binary_search(arr, 101) == -1
`;

export const B_DEBUG_PROBLEM: CodingProblem = {
  id: 'binary_search_debug',
  stageKey: 'B_DEBUG',
  title: 'Fix the Binary Search',
  description: `The function below implements binary search on a **sorted** array but contains **two bugs**. Your task is to find and fix both bugs.

**What it should do:** Search for \`target\` in a sorted list and return its index, or \`−1\` if not found.

**Hints (optional)**
- Binary search must ensure the search space shrinks every iteration.
- The initial bounds should cover every valid index.

**Time limit:** 90 seconds`,
  language: 'python',
  starterCode: BINARY_SEARCH_BUGGY,
  testFiles: [{ path: 'test_solution.py', content: BINARY_SEARCH_TESTS }],
  testCmd: ['python', '-m', 'pytest', 'test_solution.py', '-v', '--tb=short', '--no-header'],
  timeoutMs: 30_000,
  memoryMb: 256,
};
