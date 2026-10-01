---
title: "[Model Inference] A Brief Look at CUDA Graph"
title_zh: "【模型推理】浅谈CUDA Graph"
source_hash: "55e0cda09a85f81fd7ef539a41b83dfbfe79a8e117dd87c67e44cafa3acad62c"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-01T15:25:00Z"
issue_number: 15
translated_blocks: 22
---

CUDA Graph is probably one of the most frequently mentioned features in inference optimization. The principle isn't complicated: package the kernels that were originally launched one at a time into a static graph, hand the whole thing to the GPU in one shot, and skip the scheduling overhead in between.

But how exactly does this "packaging" work? How do you use it in PyTorch? And most importantly — how much faster is it actually on an H200?

This article is a record of the process of figuring out these questions.

## 1. What LLM inference is busy doing

Graphs can reduce the overhead of kernel launch, but why does LLM inference need this so badly? Let me briefly cover the background first.

The same old story: LLM inference has two phases:

**Prefill**
- The input is the user's entire prompt
- It performs the full self-attention computation in one shot, then writes the resulting KVCache to GPU memory or other storage devices, so it can be used in the Decode phase.
- It is compute-intensive, kernels consume a lot of time, GPU utilization is relatively high, and the demand on memory IO is relatively low. In short, it is compute-bound, and compute power is the key to its speed.

**Decode**
- An autoregressive process, generating only one token at a time
- It uses the previously computed KV Cache and only does the necessary updates. When inferring a single request, the Tensor dimension we feed into the model is `[1, D]`, where D is the Embedding dimension.
- It is memory-bound. A single request involves little computation, but it needs to load a huge KVCache, and the longer the inference runs, the greater the pressure of loading the KVCache.

For this inference process, we can think of the CPU as preparing, step by step, the kernel-related data and metadata needed for computing each layer of the model, calling launch to tell the GPU to execute, and then asynchronously preparing the information needed for the next computation.

At this point, because Prefill and Decode have different characteristics, the collaboration and waiting between CPU and GPU behave differently.

1. In Prefill, since the Kernel computation time is relatively long, the CPU-side overhead can basically be overlapped by the GPU's computation, so the core focus should be on how to make the GPU Kernel run faster.

<img width="1100" height="344" alt="Image" src="https://github.com/user-attachments/assets/eabf12ac-5f47-4f78-a7af-d02f49004a45" />

2. In the Decode phase, there are really two aspects. First, the Kernel computation is relatively small, so it takes very little time; in this situation the GPU ends up waiting on the CPU. This is also why we often say the Decode phase needs CUDA Graph enabled — the goal of CUDA Graph is to eliminate the problem of the GPU waiting on the CPU, making GPU computation more efficient.

<img width="1094" height="456" alt="Image" src="https://github.com/user-attachments/assets/06e9887f-bd43-48bb-928b-34e9402e66e0" />

Nowadays, mainstream inference frameworks also support CUDA Graph in the Prefill phase. This is mainly because during inference the model has a large number of small kernels, such as Norm-type Kernels. These are actually similar to the Decode phase: the GPU also has to wait on the CPU, so CUDA Graph can be used here too. As for the details, I'll write a separate post later specifically covering some details of Prefill Piecewise CUDA Graph.

---
## 2. What is the PyTorch CPU agonizing over during inference?

Because frameworks like PyTorch generally support many Kernel implementations for a single operator, supporting so many Kernel implementations means there is a large amount of dispatch code used to automatically route to different kernels at runtime, along with a lot of preparation work. Once all that work is done, it calls cudaLaunchKernel to hand things over to the CUDA runtime layer for some preparation and to send it to the GPU. While the GPU is running, there are actually some operations too, such as the GPU side preparing the Kernel environment, and some post-processing to clean up state after execution.
In summary, as shown in the figure, a Kernel goes through these steps from being initiated by PyTorch to finishing execution:
1. CPU:
	1. PyTorch C++ Dispatch
	2. Kernel Launcher Prepare
	3. cudaLaunchKernel
2. GPU:
	1. Command Processor
	2. Kernel Execute
	3. Post-Process

<img width="1538" height="478" alt="Image" src="https://github.com/user-attachments/assets/4a84879b-cc43-47ae-8b42-432bc97113d0" />

### 2.1. Pytorch Dispatch & Kernel Prepare

Pytorch Dispatch: This is actually a common problem for all execution frontend frameworks that support multiple kernels and are implemented in Python.
1. Cross-language overhead: the call path necessarily involves going through bindings or other mechanisms between multiple languages, from Python to C++ to the actual invocation, all of which adds overhead.
2. Checking and locating the kernel function pointer to execute: this doesn't necessarily happen at the C++ layer — for example, many of Sglang's kernel dispatches happen at the Python layer.
3. Preparing data and metadata: during dispatch, since different kernels require different input memory layouts/parameters and metadata, the framework also needs a conversion step here.

Kernel Prepare: mainly the process of extracting raw pointers / computing Grid/Block dimensions / computing SharedMemory before executing the kernel. In modern inference engines these steps are usually handled by fairly specialized kernel libraries, such as Flashinfer/Cutlass/Triton.
1. Extracting raw pointers: a CUDA kernel doesn't understand PyTorch's Tensor objects. The prepare stage needs to call .data_ptr() to pull out the underlying GPU memory physical addresses (pointers) of q, k_cache, v_cache.
2. Grid/Block dimension computation: for example, during inference each request has a different sequence length, and most frameworks use Paged KV Cache. So at this stage, the CPU must dynamically compute, based on the current Batch Size, the true length of each sequence, and the KV Cache Block mapping table (Block Tables): **how many CUDA Blocks do I need to launch? How many threads (Threads) does each Block get to process which token?** Currently, because many kernels use JIT techniques to pre-compile these parameters ahead of time, this stage also often involves dynamically finding the pre-compiled kernel that matches the input conditions.
3. Computing SharedMemory/Stage and similar parameters.

After these steps are done, everything is handed over to cudaLaunchKernel to prepare and execute the kernel.

### 2.2. Kernel Launch

In code, a kernel launch is really just a call like `kernel<<<grid, block>>>(...)`. A lot happens behind that syntax, mainly runtime preparation before sending execution instructions to the GPU, for example:

1. **Argument preparation**: copy kernel arguments to constant memory
2. **Configuration parsing**: grid, block, shared memory, stream, and other settings
3. **Command enqueue**: generate a kernel launch command and insert it into the stream's command queue
4. **Possible dispatch**: if the queue is full or synchronization is needed, send it to the GPU through the driver

During inference, these steps run every single time, no matter how simple the kernel itself is. For kernels with long compute time (such as matmul), launch overhead is negligible; but for tiny kernels (such as an element-wise rms_norm), launch time and execution time can be about the same.

It's like ordering at a restaurant:
- Order a steak (a kernel with long compute time): you wait 30 minutes for the food and 1 minute to order, so the ordering is a tiny fraction
- Order a glass of water (a tiny kernel): pouring the water takes only 5 seconds, but ordering still takes 1 minute, so the ordering is a huge fraction.

### 2.3. Command Process & Post Process
Command Processor: responsible for receiving instructions, parsing the grid/dim, and assigning tasks to SMs. The CPU sends Kernel A; the Command Processor receives it, parses it, and schedules it. Once execution finishes, it has to stop and wait for the CPU to send the instruction for Kernel B over the PCIe bus. Even if the CPU sends it very quickly, the Command Processor incurs a hardware cycle cost every time it processes an independent instruction and evaluates Stream dependencies.

> A CUDA Graph is like the many precompiled templates we use in C++ programming — it turns a dynamic Process into a static one. Finishing Kernel A and going straight to Kernel B is a completely static process, with no scheduling needed.

Post Process: mainly updates the state machine and, in particular, the information at synchronization points.

### 2.4. How much time do these overheads actually take

In my current environment, testing on an H200 + Qwen3-0.6B, I'm using the data summarized by `nsys` and `Pytorch Profile` ClaudeCode here. With Batch=1, the eager and graph states take 15.56ms and 4.44ms respectively, for an overall speedup of `3.5x`[^1]. The later tests on the H200 will explain in detail how to measure this data.

| Stage                                      | Location | Eager                                                                                                  | Graph                                     | Savings/kernel | Data source                                                  |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------- | ------------------------------------------------------------ |
| PyTorch Dispatch + Kernel Launcher Prepare | CPU      | **4-37 µs/call depending on op**<br/>(aten::mul/add ~5 µs, aten::mm 12 µs, aten::cudnn_attention_forward 37 µs) | ~0 (only at the outermost replay layer)                        | ~99%           | [x] torch.profiler `self_cpu_time` measured                          |
| **cudaLaunchKernel()**                     | CPU      | **3.5 µs/call** (nsys) / **4.0 µs/call** (profiler)                                                    | ~0 (the graph has only one cudaGraphLaunch at 0.51 ms) | 99%+           | [x] [x] nsys `cuda_api_sum` + torch.profiler double-verified                  |
| Command processor                          | GPU      | *counted in gap*                                                                                               | near zero                                        | most           | -                                                            |
| **Kernel Execute**                         | GPU      | **2.06 µs**                                                                                            | **2.24 µs**                               | **-0.18 µs**   | [x] nsys `cuda_gpu_kern_sum` measured (graph is slightly more expensive due to node metadata overhead) |
| Post Process                               | GPU      | *counted in gap*                                                                                               | near zero                                        | most           | -                                                            |
| **cudaLaunchKernel+Post Process**          | GPU      | **7.22 µs/gap**                                                                                        | **0.31 µs/gap**                           | **6.91 µs**    | [x] measured indirectly: `(total_gpu - kernel_exec) / kernel_count`           |

## 3. CUDA Graph
What CUDA Graph is has actually been answered by much of the discussion above. To sum it up in one sentence: CUDA Graph is a working model that predefines a series of GPU operations (such as kernel execution and memory copies) and their dependencies as a directed acyclic graph (DAG), then submits the whole thing to the GPU as a single instruction for automatic scheduling and execution, with the goal of completely eliminating the scheduling overhead caused by the CPU issuing instructions frequently.

<img width="1577" height="985" alt="Image" src="https://github.com/user-attachments/assets/2a4d02bf-147a-42a8-bf00-a27adc27c661" />

Being a DAG, it naturally has nodes and edges. In CUDA Graph, nodes are individual GPU operations, for example: Kernel launches / memory operations (D2H/H2D) / memory management (malloc/free) / Host Func / empty nodes (used for synchronization and coordination). The edges have no actual operation; they merely represent a dependency relationship, such as parallel or dependent.

### 3.1. Graph vs Stream: From "Event-Driven" to "DAG"

Back when you wrote CUDA code, you used streams by default. A stream is essentially a queue — the operations you push in order get executed by the GPU in order. Simple and crude, but the problems are obvious:

```c
// Stream model: linear queue, CPU submits one by one
cudaMemcpyAsync(d_in, h_in, size, H2D, stream);
kernelA<<<grid, block, 0, stream>>>(d_in, d_tmp);  // A
kernelB<<<grid, block, 0, stream>>>(d_tmp, d_out); // B must wait for A to finish
```

What if B and C actually have no dependency on each other and could run in parallel? The traditional approach is to spin up a few more streams and then use events to synchronize:

```c
cudaStream_t s1, s2;
cudaEvent_t ev;
// ... create stream and event

kernelA<<<grid, block, 0, s1>>>();
cudaEventRecord(ev, s1);           // A signals when done

kernelB<<<grid, block, 0, s2>>>();
cudaStreamWaitEvent(s2, ev);       // B waits for A
kernelC<<<grid, block, 0, s2>>>(); // C also waits for A, but B and C can run in parallel
```

<img width="988" height="248" alt="Image" src="https://github.com/user-attachments/assets/3afd2453-3ae2-43ab-9f78-41d229b3a5e5" />

The code immediately becomes long and ugly. And this is only two parallel branches — real inference has dozens of kernels, and managing events by hand is a huge pain.

Graph takes a completely different approach — you just draw a dependency graph:

<img width="506" height="228" alt="Image" src="https://github.com/user-attachments/assets/a47a1e4f-55a5-4dd2-8782-f680014dcd78" />

No need to manage events by hand; the runtime sees the graph structure and knows B and C can run together, and D must wait for both of them to finish. This is the difference between declarative and imperative.

> The graph is static, so the compiler statically allocates all resources, and no scheduling is needed. This is also a double-edged sword: static means losing flexibility, which is the main reason it's used primarily for inference.

### 3.2. What can go inside a Graph?

A DAG naturally has nodes and edges. Nodes are the operations that actually do work; edges are just dependencies (no actual computation).

CUDA Graph supports more node types than I expected:

| Node type   | What it actually maps to | Notes                                        |
| ----------- | ------------------------ | -------------------------------------------- |
| Kernel      | `kernel<<<...>>>()`                   | The standard action of executing a kernel    |
| Memcpy      | `cudaMemcpyAsync`                   | H2D/D2H/D2D data transfer                    |
| Memset      | `cudaMemsetAsync`                   | Zeroing a buffer                             |
| Host        | host callback function   | CPU-side callback, use with care (blocks the GPU) |
| Child Graph | Nested subgraph          | Graphs inside graphs, for modularity         |
| Empty       | No-op                    | Purely used as a synchronization point       |

For LLM inference, the vast majority of nodes are Kernels, with the occasional Memcpy (say, copying input_ids from host). Host callbacks are basically never used on performance-sensitive paths, because they force a sync, leaving the GPU stuck waiting for the CPU to run the callback.

The concept of an edge is even simpler — it's just a "who comes first" relationship. A → B means B must wait for A to finish. If two nodes aren't connected by any path, the runtime automatically runs them in parallel.

### 3.3. The three stages: Define → Instantiate → Launch

The CUDA Graph lifecycle has three steps:

**1. Define**

Build the graph's topology — add nodes, connect edges. The output of this stage is `cudaGraph_t`, just a "blueprint" that can still be modified (add nodes, remove edges, and so on).

**2. Instantiate**

Compile the blueprint into an executable. CUDA validates the topology (for example, checking for cycles), pre-allocates internal resources, and generates an execution plan. The output is `cudaGraphExec_t`. After this step the graph is "frozen" — you can't directly change its structure.

**3. Launch**

Submit the instantiated graph to a stream for execution. One launch = the entire DAG's worth of operations handed to the GPU in one shot.

> Why three steps? The core reason is **separating the overhead**. The cost of Define and Instantiate is paid only once; after that, every inference run only pays the tiny cost of Launch. If you had to re-Define + re-Instantiate every time, the Graph advantage would disappear.

Also, after Instantiate you're not completely locked out — you can update node parameters via `cudaGraphExecKernelNodeSetParams()` (for example, swapping the pointer of an input buffer) without re-instantiating. This matters a lot for inference, because the input data changes every time while the graph structure stays the same.

### 3.4. How do you build a Graph? Two ways

**Way one: Explicit API (build it by hand)**

Call the CUDA API directly to add nodes and edges:

```cpp
cudaGraph_t graph;
cudaGraphCreate(&graph);

// Add a kernel node
cudaGraphNode_t kernelNode;
cudaKernelNodeParams params = {...};
cudaGraphAddKernelNode(&kernelNode, graph, NULL, 0, &params);

// Add a dependency edge
cudaGraphAddDependencies(graph, &nodeA, &nodeB, 1);  // A → B
```

The upside is fine-grained control; the downside is verbose code. In practice you only use this when you need extreme optimization or the graph structure changes dynamically.

**Way two: Stream Capture (record it automatically)**

The more common approach — wrap a capture layer around your existing stream code and CUDA generates the graph for you:

```cpp
cudaGraph_t graph;
cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);

// Write your original code here, it will be recorded automatically
kernelA<<<grid, block, 0, stream>>>();
kernelB<<<grid, block, 0, stream>>>();
// ...

cudaStreamEndCapture(stream, &graph);
```

PyTorch's `torch.cuda.CUDAGraph` is built on top of Stream Capture. This approach barely intrudes on existing code, making it the first choice for inference optimization.

---

## 4. How to use CUDA Graph in PyTorch

Everything discussed so far is at the CUDA C++ API level, but in real projects I use PyTorch. PyTorch provides `torch.cuda.CUDAGraph`, which wraps the underlying capture, instantiate, and launch into a few lines of Python code. Especially for the `capture` pattern, the example in the official docs is really just these few lines of [^2]:
```python
import torch

# Enable CUDA Graph mode in PyTorch
model = YourModel().cuda()
static_input = torch.randn(32, 3, 224, 224, device='cuda')

# Warmup
for _ in range(3):
    _ = model(static_input)

# Capture the graph
g = torch.cuda.CUDAGraph()
with torch.cuda.graph(g):
    static_output = model(static_input)

# Training loop - replay the graph
for data in dataloader:
    static_input.copy_(data)  # Update input in-place
    g.replay()                # Execute captured operations
```

The code actually involves a few core issues:
1. Static inputs and outputs
2. warmup
3. capture limitations

> The current PyTorch CUDA Graph API only supports Capture, because PyTorch itself uses a dynamic graph (eager mode), which is somewhat at odds with the declarative static graph philosophy. If you need to use Python + the Explicit API, I recommend using `cuda-python` directly.

### 4.1. Why static

The core reason Graph demands "static": it records **pointer addresses**, not **data contents**.

```
During recording: kernel reads from d_input=0x7f00_1000, writes to d_output=0x7f00_2000
         ↓
The diagram records these two specific addresses
         ↓
Each replay: GPU reads from 0x7f00_1000, writes to 0x7f00_2000
```

If you `free` `d_input` in the middle and `malloc` a new one, the address becomes `0x7f00_5000`, but the graph still reads `0x7f00_1000` — instant segfault.

So Graph's "static" doesn't mean the data can't change, it means **the addresses can't change**. The pattern in real inference is:

```python
# 1. Pre-allocate a fixed buffer (never released for the entire lifetime)
static_input = torch.empty(max_batch, max_seq_len, device='cuda')

# 2. Each inference: fill new data into the fixed address
static_input.copy_(new_input)

# 3. replay: the graph reads from the same address
g.replay()

# 4. Read results: copy out from the fixed address
result = static_output.clone()
```

**Pointers stay fixed, data changes.** This is the precondition for Graph to work.

PyTorch's `static_input.copy_(data)` and `static_output.clone()` look a bit awkward as a pair — one writes in, one reads out — but both exist to protect the static addresses in the graph from being clobbered.

Beyond inputs and outputs, Graph also imposes quite a few restrictions on operations inside the model[^3]:

**Memory allocation related (the strictest restrictions)**
- `tensor.resize_()` / `tensor.resize_as_()` — may change the underlying storage address
- Any operation that causes a tensor to reallocate memory — e.g. assigning the result of `cat` back to the original variable
- Dynamically creating new tensors — memory allocated during capture has its address pinned, but if you allocate again during graph execution, the address isn't stable

**Synchronization operations**
- `torch.cuda.synchronize()` — operations don't execute during capture, so a sync will deadlock
- `tensor.item()` / `tensor.tolist()` — copying GPU data to CPU, which implies synchronization
- `print(tensor)` — same as above; to read the value you must sync

**Data-dependent control flow**
- `if tensor.sum() > 0:` — the condition depends on a tensor's value, but the value doesn't exist during capture
- `for i in range(tensor.size(0)):` — if the size is dynamic, it may differ each time
- Any code that needs to know a tensor's concrete value to decide which branch to take

**Some safe alternatives**
```python
# Unsafe
if x.sum() > 0:
    y = x * 2
else:
    y = x + 1

# Safe — use mask instead of branching
mask = (x > 0).float()
y = mask * (x * 2) + (1 - mask) * (x + 1)

# Unsafe
for i in range(batch_size):  # batch_size is a tensor value
    process(x[i])

# Safe — use a fixed number of loop iterations
for i in range(MAX_BATCH):  # MAX_BATCH is a constant
    if i < batch_size:
        process(x[i])
```

Put simply: **the graph's topology must be fixed**, and it cannot depend on runtime data to make any decision.

### 4.2. Why Is Warmup Mandatory?

At first I thought warmup was just "to make performance stable," but later I found that without it, capture simply doesn't come out right.

Many PyTorch operations are lazy:
- cuDNN convolutions benchmark different algorithms on the first call
- JIT-compiled kernels are only compiled when first invoked
- the cuBLAS workspace is only allocated on the first matmul

These "first times" produce extra memory allocations and kernel launches. If they are triggered during capture, they get recorded into the graph — and every subsequent replay re-selects the algorithm / recompiles, which is completely wrong.

**The role of warmup: trigger all lazy initialization ahead of time, so that capture only records the "steady-state" sequence of operations.**

Why run it 3 times? The 1st run triggers cuDNN benchmark and JIT compilation, the 2nd run may see some allocator strategy adjust, and the 3rd run confirms that it really is steady state.

### 4.3. Restrictions During Capture

Capture is actually similar to the MOCK execution we do when developing software. Many behaviors are mocked out rather than actually executed — the whole graph is just captured quickly from the operator stream via mock + capture. So besides the earlier static restrictions, there are also the following:

1. **Synchronous operations will deadlock**

```python
# Error: sync will hang during capture
with torch.cuda.graph(g):
    x = model(input)
    torch.cuda.synchronize()  # Deadlock! The operation never executed; you are waiting for something that will never complete
```

sync has to wait for the operation to complete, but during capture the operations are mocked and don't actually run, so sync waits forever.

2. **You cannot read tensor values**

```python
# Error: tensor value does not exist during capture
with torch.cuda.graph(g):
    x = model(input)
    print(x[0])       # Error: cannot read value
    if x.sum() > 0:   # Error: conditional dependency value
        ...
```

This restriction is stricter than you'd think. For example, if you want to print a log to inspect intermediate results, that's completely impossible during capture. You can only capture first, then find a way to look at it during replay.

3. **Control flow must be static**

```python
# Error: control flow depending on tensor value
with torch.cuda.graph(g):
    for i in range(seq_len):  # seq_len cannot be a tensor value
        process(x[i])

# Correct: use fixed count + mask
with torch.cuda.graph(g):
    for i in range(MAX_LEN):  # MAX_LEN is a Python constant
        mask = (i < seq_len).float()
        out += mask * process(x[i])
```

In real inference, seq_len may differ each time, but the graph structure must be fixed. The workaround is to loop over the maximum length and then use a mask to zero out the invalid positions.

## 5. CUDA Graph in a real inference engine:

CUDA Graph is used fairly widely in inference engines, but for an inference server, because the number of requests varies, static CUDA Graph is also a challenge during decode inference. Modern inference engines such as vLLM, Sglang, and TensorRT-LLM usually use bucketing: at initialization they capture a set of CUDA Graphs for different input batch sizes, and replay them during inference. The logic is shown in the figure:

<img width="1004" height="604" alt="Image" src="https://github.com/user-attachments/assets/403d2cb1-de4e-41bf-93c8-3612162bf442" />

This is also the meaning of the sglang parameter `--cuda-graph-bs`.

## 6. How much does CUDA Graph actually speed things up?

Here I tested Qwen3-0.6B on an H200, with the following code
```python

from __future__ import annotations

import json
import statistics
import time

import torch
from transformers import StaticCache

MODEL_ID = "Qwen/Qwen3-0.6B"
DEVICE = "cuda:0"
DTYPE = torch.bfloat16

# Measurement parameters
PROMPT = "The key difference between CUDA streams and CUDA graphs is"
NUM_DECODE_TOKENS = 128
WARMUP_STEPS = 10

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"


@dataclass
class LoadedModel:
    model: torch.nn.Module
    tokenizer: AutoTokenizer


def load_model() -> LoadedModel:
    """Load Qwen3-0.6B. eval + no_grad handled on the caller side."""
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=DTYPE,
        attn_implementation="sdpa",
    ).to(DEVICE)
    model.eval()
    return LoadedModel(model=model, tokenizer=tokenizer)


def encode_prompt(tokenizer, prompt: str = PROMPT) -> torch.Tensor:
    """Prompt → input_ids on device. Shape: [1, prompt_len]."""
    return tokenizer(prompt, return_tensors="pt").input_ids.to(DEVICE)


def _prefill(model, input_ids, cache):
    """Prefill runs eager. Returns the first decode token and next cache_position."""
    prompt_len = input_ids.shape[1]
    cache_position = torch.arange(prompt_len, dtype=torch.int64, device=DEVICE)
    out = model(
        input_ids=input_ids,
        past_key_values=cache,
        cache_position=cache_position,
        use_cache=True,
    )
    next_tokens = out.logits[:, -1:, :].argmax(dim=-1)
    next_cache_position = cache_position[-1:] + 1
    return next_tokens, next_cache_position


def _eager_decode_step(model, cache, input_ids, cache_position):
    """Run one decode step. Used for warmup / to prepare the cuBLAS workspace for capture."""
    out = model(
        input_ids=input_ids,
        past_key_values=cache,
        cache_position=cache_position,
        use_cache=True,
    )
    return out


@torch.no_grad()
def run_graphed() -> dict:
    loaded = load_model()
    model, tokenizer = loaded.model, loaded.tokenizer
    input_ids = encode_prompt(tokenizer)
    prompt_len = input_ids.shape[1]
    max_cache_len = prompt_len + NUM_DECODE_TOKENS + 16

    # ─────────────────────────────────────────────
    # One-time cache: build only one from start to finish
    # Reason: the cache pointer captured by the graph must still be valid at replay time
    # ─────────────────────────────────────────────
    cache = StaticCache(
        config=model.config, max_cache_len=max_cache_len, device=DEVICE, dtype=DTYPE,
    )

    print(f"[setup] prefill + {WARMUP_STEPS} eager warmup decode steps ...")
    next_tokens, next_cache_position = _prefill(model, input_ids, cache)
    out = None
    for _ in range(WARMUP_STEPS):
        out = _eager_decode_step(model, cache, next_tokens, next_cache_position)
        next_tokens = out.logits[:, -1:, :].argmax(dim=-1)
        next_cache_position = next_cache_position + 1
    torch.cuda.synchronize()

	# Static inputs and outputs
    static_input_ids = next_tokens.clone()                # [1, 1]
    static_cache_position = next_cache_position.clone()   # [1]

    print("[capture] recording decode graph ...")
    
    s = torch.cuda.Stream()
    g = torch.cuda.CUDAGraph()
    
    s.wait_stream(torch.cuda.current_stream())
    with torch.cuda.stream(s):
        for _ in range(3):
            out = model(
                input_ids=static_input_ids,
                past_key_values=cache,
                cache_position=static_cache_position,
                use_cache=True,
            )
    torch.cuda.current_stream().wait_stream(s)
    
    
    with torch.cuda.graph(g):
        out = model(
                input_ids=static_input_ids,
                past_key_values=cache,
                cache_position=static_cache_position,
                use_cache=True,
            )
    static_output_logits = out.logits 

    # Reset cache state + redo prefill
    # Key: StaticCache has an internal cumulative_length counter, incremented on every forward
    # input_len (regardless of whether cache_position is reused). If not reset, it will keep growing until it exceeds
    # max_cache_len, causing index_copy_ somewhere to trigger "index out of bounds".
    # cache.reset() zeroes out keys/values and does cumulative_length.zero_().
    # Note: this only zeroes the contents, the address stays the same — which is exactly the premise the graph relies on, so reset does not affect g.
    cache.reset()

    next_tokens, next_cache_position = _prefill(model, input_ids, cache)
    static_input_ids.copy_(next_tokens)
    static_cache_position.copy_(next_cache_position)
    torch.cuda.synchronize()


    # Measurement: use graph.replay() instead of model() for the decode loop
    events_pair: list[tuple[torch.cuda.Event, torch.cuda.Event]] = []

    t0 = time.perf_counter()
    for step in range(NUM_DECODE_TOKENS - 1):  # -1 because prefill has already produced the first token
        step_start = torch.cuda.Event(enable_timing=True)
        step_end = torch.cuda.Event(enable_timing=True)

        step_start.record()
        g.replay()
        step_end.record()
        events_pair.append((step_start, step_end))

        # Use the replay output to produce the next input. copy_() updates the static buffer in place
        next_tokens = static_output_logits[:, -1:, :].argmax(dim=-1)
        static_input_ids.copy_(next_tokens)
        static_cache_position.add_(1)  # In-place +1

    torch.cuda.synchronize()
    t1 = time.perf_counter()
    total_wall_ms = (t1 - t0) * 1000
    per_step_gpu_ms = [s.elapsed_time(e) for s, e in events_pair]

	
	# Statistics
    decode_ms = per_step_gpu_ms  # Everything here is decode (prefill is outside)
    result = {
        "model": MODEL_ID,
        "dtype": "bfloat16",
        "cache": "static",
        "attention": "sdpa",
        "mode": "graphed",
        "max_cache_len": max_cache_len,
        "prompt_len": prompt_len,
        "num_decode_tokens": len(decode_ms),
        "decode_per_step_ms": decode_ms,
        "decode_stats": {
            "mean": statistics.mean(decode_ms),
            "median": statistics.median(decode_ms),
            "stdev": statistics.stdev(decode_ms) if len(decode_ms) > 1 else 0.0,
            "min": min(decode_ms),
            "max": max(decode_ms),
        },
        "total_wall_ms": total_wall_ms,
        "total_gpu_ms": sum(per_step_gpu_ms),
        "cpu_overhead_ms": total_wall_ms - sum(per_step_gpu_ms),
    }


    print(f"\n[graphed] decode mean:  {result['decode_stats']['mean']:.3f} ms/step")
    print(f"[graphed] decode stdev: {result['decode_stats']['stdev']:.3f} ms")
    print(f"[graphed] total wall:   {total_wall_ms:.1f} ms")
    print(f"[graphed] CPU overhead: {result['cpu_overhead_ms']:.1f} ms "
          f"({result['cpu_overhead_ms']/total_wall_ms*100:.2f}%)")
    print(f"[graphed] saved → {out_path}")
    return result


if __name__ == "__main__":
    run_graphed()

```

### 6.1. Results

| Metric | eager (StaticCache) | graph | Ratio |
|---|---:|---:|---:|
| decode mean | 16.43 ms | 4.50 ms | 3.65× |
| decode stdev | 0.106 ms | 0.072 ms | 1.47× |
| decode min | 16.26 ms | 4.49 ms | — |
| decode max | 17.00 ms | 5.30 ms | — |
| total wall | 2108 ms | 574 ms | 3.67× |

Bucketed results:

<img width="2384" height="711" alt="Image" src="https://github.com/user-attachments/assets/cfc5b657-fe1f-43e4-ba62-047dd665efcc" />

### 6.2. What nsys shows
All kernel operations don't need to wait to be merged into a single Graph

<img width="2906" height="920" alt="Image" src="https://github.com/user-attachments/assets/8753b1d0-d6c0-4fe7-9d7f-c0dcf7fa8699" />

Eager:

<img width="2954" height="812" alt="Image" src="https://github.com/user-attachments/assets/6581fb73-a529-48c4-9638-dfc0e63026c3" />

## 7. Summary

After working through all of this, here are roughly the conclusions about using CUDA Graph:

**Which scenarios are worth it**

- The decode phase benefits the most. Prefill kernels are large, so launch overhead is a small fraction; decode is all tiny kernels, and CPU submission becomes the bottleneck. In practice, Qwen3-0.6B on an H200 gets a 3.6x speedup in decode, and the gap gets even more extreme on smaller models.
- Serving scenarios where the batch size is fixed or varies within a narrow range. Dynamic shapes are the natural enemy of graphs: you either preallocate the maximum buffer and waste memory, or maintain a pile of graphs for different sizes.
- Models that have already had kernel fusion applied. If the kernel count is still in the hundreds, the graph's benefit gets diluted.

**The main costs and limitations**

- Memory. StaticCache + Graph's static buffers mean preallocating for the maximum possible length, so GPU memory usage is higher than dynamic allocation.
- Flexibility. Control flow has to use masks instead of branches, you can't print intermediate results while debugging, and debugging is especially painful.
- The overhead of the first capture. Warmup + capture takes tens to hundreds of milliseconds, which is a problem for scenarios sensitive to cold start.

## 8. References

[^1]: The range mentioned in [NVIDIA's documentation](https://docs.nvidia.com/dl-cuda-graph/cuda-graph-basics/introduction.html#sources-of-launch-overhead) is the overhead on older hardware plus older versions of PyTorch; each CUDA generation has been optimizing cudaLaunchKernel time. For modern ML frameworks (PyTorch eager, TensorFlow, JAX), the Python transition cost is very low. So the actual numbers and their distribution may differ from the official data.
[^2]: https://docs.nvidia.com/dl-cuda-graph/latest/index.html#quick-start
[^3]: [Writing CUDA Graph-Compatible Code](https://docs.nvidia.com/dl-cuda-graph/latest/torch-cuda-graph/best-practices.html#writing-cuda-graph-compatible-code)
