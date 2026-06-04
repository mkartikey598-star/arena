export type Difficulty = "easy" | "medium" | "hard"

export interface Question {
  id: number
  title: string
  difficulty: Difficulty
  category: string
  description: string
  examples: { input: string; output: string }[]
  constraints: string[]
  starterCode: Record<string, string>
}

export const questions: Question[] = [
  {
    id: 1,
    title: "Two Sum",
    difficulty: "easy",
    category: "Arrays",
    description: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers that add up to target. You may assume each input has exactly one solution.",
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]" },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
    ],
    constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Only one valid answer exists."],
    starterCode: {
      python: "def two_sum(nums, target):\n    pass\n",
      cpp: "vector<int> twoSum(vector<int>& nums, int target){}",
      javascript: "function twoSum(nums, target) {}",
      java: "class Solution { int[] twoSum(int[] nums, int target) {} }",
      rust: "fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> { vec![] }",
      go: "func twoSum(nums []int, target int) []int { return nil }",
      typescript: "function twoSum(nums:number[], target:number):number[]{return []}"
    }
  },
  {
    id: 2,
    title: "Valid Parentheses",
    difficulty: "easy",
    category: "Stack",
    description: "Check valid parentheses string.",
    examples: [
      { input: "()", output: "true" }
    ],
    constraints: ["1 <= s.length <= 10^4"],
    starterCode: {
      python: "def is_valid(s): pass",
      cpp: "bool isValid(string s){}",
      javascript: "function isValid(s){}",
      java: "boolean isValid(String s){}",
      rust: "fn is_valid(s:String)->bool{false}",
      go: "func isValid(s string) bool {return false}",
      typescript: "function isValid(s:string):boolean{return false}"
    }
  },
  {
    id: 3,
    title: "Best Time to Buy and Sell Stock",
    difficulty: "easy",
    category: "Arrays",
    description: "Max profit from single buy/sell.",
    examples: [{ input: "[7,1,5,3,6,4]", output: "5" }],
    constraints: ["1 <= n <= 10^5"],
    starterCode: {
      python: "def max_profit(prices): pass",
      cpp: "int maxProfit(vector<int>& p){}",
      javascript: "function maxProfit(p){}",
      java: "int maxProfit(int[] p){}",
      rust: "fn max_profit(p:Vec<i32>)->i32{0}",
      go: "func maxProfit(p []int) int {return 0}",
      typescript: "function maxProfit(p:number[]):number{return 0}"
    }
  },

  {
    id: 4,
    title: "Binary Search",
    difficulty: "easy",
    category: "Search",
    description: "Find target in sorted array.",
    examples: [{ input: "[1,2,3], target=2", output: "1" }],
    constraints: ["log n search"],
    starterCode: {
      python: "def search(nums,target): pass",
      cpp: "int search(vector<int>&n,int t){}",
      javascript: "function search(n,t){}",
      java: "int search(int[] n,int t){}",
      rust: "fn search(n:Vec<i32>,t:i32)->i32{0}",
      go: "func search(n []int,t int) int {return 0}",
      typescript: "function search(n:number[],t:number):number{return 0}"
    }
  },

  {
    id: 5,
    title: "Reverse Linked List",
    difficulty: "easy",
    category: "Linked List",
    description: "Reverse a linked list.",
    examples: [{ input: "1->2->3", output: "3->2->1" }],
    constraints: ["O(n)"],
    starterCode: {
      python: "def reverse(head): pass",
      cpp: "ListNode* reverse(ListNode* h){}",
      javascript: "function reverse(h){}",
      java: "ListNode reverse(ListNode h){}",
      rust: "fn reverse(h:Option<Box<ListNode>>)->Option<Box<ListNode>>{None}",
      go: "func reverse(h *ListNode) *ListNode {return nil}",
      typescript: "function reverse(h:ListNode):ListNode{return h}"
    }
  },

  {
    id: 6,
    title: "Climbing Stairs",
    difficulty: "easy",
    category: "DP",
    description: "Count ways to climb stairs.",
    examples: [{ input: "n=3", output: "3" }],
    constraints: ["DP"],
    starterCode: {
      python: "def climb(n): pass",
      cpp: "int climb(int n){}",
      javascript: "function climb(n){}",
      java: "int climb(int n){}",
      rust: "fn climb(n:i32)->i32{0}",
      go: "func climb(n int) int {return 0}",
      typescript: "function climb(n:number):number{return 0}"
    }
  },

  {
    id: 7,
    title: "Valid Anagram",
    difficulty: "easy",
    category: "Strings",
    description: "Check if two strings are anagrams.",
    examples: [{ input: "a,baba", output: "false" }],
    constraints: ["26 letters"],
    starterCode: {
      python: "def is_anagram(a,b): pass",
      cpp: "bool isAnagram(string a,string b){}",
      javascript: "function isAnagram(a,b){}",
      java: "boolean isAnagram(String a,String b){}",
      rust: "fn is_anagram(a:String,b:String)->bool{false}",
      go: "func isAnagram(a,b string) bool {return false}",
      typescript: "function isAnagram(a:string,b:string):boolean{return false}"
    }
  },

  {
    id: 8,
    title: "Maximum Subarray",
    difficulty: "medium",
    category: "DP",
    description: "Kadane's algorithm.",
    examples: [{ input: "[-2,1,-3,4]", output: "4" }],
    constraints: ["O(n)"],
    starterCode: {
      python: "def max_subarray(nums): pass",
      cpp: "int maxSub(vector<int>&n){}",
      javascript: "function maxSub(n){}",
      java: "int maxSub(int[] n){}",
      rust: "fn max_subarray(n:Vec<i32>)->i32{0}",
      go: "func maxSub(n []int) int {return 0}",
      typescript: "function maxSub(n:number[]):number{return 0}"
    }
  },

  {
    id: 9,
    title: "Container With Most Water",
    difficulty: "medium",
    category: "Two Pointers",
    description: "Max area between lines.",
    examples: [{ input: "[1,8,6,2]", output: "8" }],
    constraints: ["n up to 10^5"],
    starterCode: {
      python: "def max_area(h): pass",
      cpp: "int maxArea(vector<int>&h){}",
      javascript: "function maxArea(h){}",
      java: "int maxArea(int[] h){}",
      rust: "fn max_area(h:Vec<i32>)->i32{0}",
      go: "func maxArea(h []int) int {return 0}",
      typescript: "function maxArea(h:number[]):number{return 0}"
    }
  },

  {
    id: 10,
    title: "Product of Array Except Self",
    difficulty: "medium",
    category: "Arrays",
    description: "Return product array.",
    examples: [{ input: "[1,2,3]", output: "[6,3,2]" }],
    constraints: ["no division"],
    starterCode: {
      python: "def product(nums): pass",
      cpp: "vector<int> product(vector<int>&n){}",
      javascript: "function product(n){}",
      java: "int[] product(int[] n){}",
      rust: "fn product(n:Vec<i32>)->Vec<i32>{vec![]}",
      go: "func product(n []int) []int {return nil}",
      typescript: "function product(n:number[]):number[]{return []}"
    }
  }
]
