---
title: "EM Algorithm Notes"
title_zh: "EM算法笔记"
source_hash: "de96643fb3ec9c06bbcd65a450574ab110fe7556c71d6aeee9edda77ab768abb"
model: "deepseek-chat"
cache_version: 1
translated_at: "2026-10-01T15:24:59Z"
issue_number: 16
translated_blocks: 8
---

> I recently ran into the EM algorithm again. Too often I just use something without knowing why, so this time, before using it, I went back and read up on it some more.

Where the EM algorithm applies: maximum likelihood estimation of the parameters of a probabilistic model that has hidden variables.

First question: what is a hidden variable?

## Latent Variables

> Something that cannot be directly observed, but that influences the state of the system and the outputs that can be observed. It refers to an unobservable random variable. Latent variables can be inferred from observed data by using a mathematical model.

Probabilistic models sometimes contain both observable variables and hidden variables, or latent variables.

For example, in a Gaussian mixture model, from the perspective of the mixture model, the random variable $z$ indicates which Gaussian distribution the corresponding sample $x$ belongs to. It is a discrete distribution satisfying $\sum_{i=1}^{K}p_{z_i}=1$, where $z$ takes $k$ values. But in the actual data collection process, we cannot observe the random variable $z$ from the data — we can only observe the variable $x$. This $z$ is the latent variable.

**What problems does the appearance of latent variables cause?**

The appearance of latent variables causes some latent variable parameters to be introduced when constructing the L of MLE, so that the whole L has no analytical solution.

Examples:

1. MLE of GMM
Following the example above, derive the MLE of GMM.

$$
\begin{aligned}
L &= log(p(x)) = log(\prod_{i=1}^{N} p(x_i)) \\
  &= \sum_{i=1}^{N} log(p(x_i)) \\
  &= \sum_{i=1}^{N} log(\sum_{k=1}^{K} p_{k}N(x_i|\theta_k))
\end{aligned}
$$

Since an expression like $log(a+b+c)$ is very hard to solve analytically, it is difficult to solve.

2. Three-coin model (from Statistical Machine Learning)

Suppose there are 3 coins A, B, C, and the probability of heads for each coin is π, p, q. Perform the following coin-tossing experiment: first toss coin A — heads selects B, tails selects C; then toss the selected coin, recording 1 for heads and 0 for tails. Perform 10 independent trials, with the following results: 1, 1, 0, 1, 0, 0, 1, 0, 1, 1. Suppose we can only observe the final result (we only know whether the final result is 0 or 1), and cannot observe the coin-tossing process (we do not know whether A came up heads or tails, that is, we do not know whether B or C was selected). How do we estimate the probability of heads for the three coins?

Let the observed variable be $y$, let the random variable $z$ be the unobservable latent variable, i.e. the outcome of tossing A, and let $\theta=(\pi, p, q)$ be the model parameters. Then the distribution can be written as:

$$P(y|\theta)=\sum_{z}P(y, z|\theta)=\sum_{z}P(y|z\theta)P(z|\theta)=\pi p^y (1-p)^{1-y} + (1-\pi) q^y (1-q)^{1-y}$$

Let the observed data be $Y=(Y_1,Y_2,Y_3,...,Y_n)^T$ and the unobserved data be $Z=(Z_1, Z_2,...,Z_n)^T$. Then the likelihood function of the observed function:
$$
P(Y|\theta)=\sum_{z} P(Z|\theta)P(Y|Z,\theta)
$$
that is
$$
P(Y|\theta) = \prod_{j=1}^{n}[\pi p^y (1-p)^{1-y} + (1-\pi) q^y (1-q)^{1-y}]
$$
Then, by maximum likelihood estimation

$$
\hat{\theta} = \argmax_{\theta} logP(Y|\theta)
$$

From the expression $P(Y|\theta)$, we can see that after taking the derivative with $logP(Y|\theta)$ and setting it to 0, there is no analytical solution. Therefore it can only be approximated iteratively. This brings in the EM algorithm, which is the efficient iterative method used to solve this problem.

## EM Algorithm

We generally let $Y$ denote the data of the observed random variables, $Z$ the data of the latent variables, $Y,Z$ the complete-data, and $Z$ the incomplete-data.

The core of the EM algorithm is to obtain the maximum likelihood estimate of $L(\theta) = logP(Y|\theta)$ in the presence of latent variables through iteration, consisting of two steps: the E step and the M step.

Let us first set aside the EM algorithm itself and look at its derivation. How exactly does the EM algorithm solve the problem that $logP(Y|\theta)$ has no analytical solution?

### Derivation of EM

From the analysis above, we know that EM has no analytical solution, so we cannot obtain the maximum in one shot. Instead, we solve it by iterative approximation — for example, using gradient ascent or Newton's method. But this approach has a problem: the gradient, or derivative, of $logP(Y|\theta)$ itself is not easy to compute. So the EM algorithm first uses Jensen's inequality to find a lower bound for $logP(Y|\theta)$.

#### Finding a Lower Bound for $logP(Y|\theta)$

$$
\begin{aligned}
L(\theta) = logP(Y|\theta) &= log(\sum_{Z} P(Y, Z|\theta)) \\

&= log(\sum_{Z} P(Z|Y, \theta^{t})\frac{P(Y, Z|\theta)}{P(Z|Y, \theta^{t})})\\

& \geq \sum_{Z} P(Z|Y, \theta^{t}) log(\frac{P(Y, Z|\theta)}{P(Z|Y, \theta^{t})})
\end{aligned}
$$

The inequality in the middle follows from Jensen's inequality. Let $B(\theta, \theta^{t}) = \sum_{Z} P(Z|Y, \theta^{t}) log(\frac{P(Y, Z|\theta)}{P(Z|Y, \theta^{t})})$, then $logP(Y|\theta) \geq B(\theta, \theta^{t})$.

Also observe:
$$
\begin{aligned}
B(\theta^{t}, \theta^{t}) &= \sum_{Z} P(Z|Y, \theta^{t}) log(\frac{P(Y, Z|\theta^{t})}{P(Z|Y, \theta^{t})} \\
&=\sum_{Z} P(Z|Y, \theta^{t}) log(\frac{P(Y|\theta^{t})P(Z|Y,\theta^{t})}{P(Z|Y,\theta^{t})}) \\
&=\sum_{Z} P(Z|Y, \theta^{t}) logP(Y|\theta^{t}) \\
&=P(Y|\theta^{t})
\end{aligned}
$$

The purpose of using an iterative algorithm is to gradually bring $L(\theta^t)$ closer to the maximum $L(\theta)$, so the relationship between the two also satisfies $L(\theta) > L(\theta^t)$. From the above, any update that increases $B(\theta, \theta^{t})$ also increases $L(\theta)$. To make $L(\theta)$ as large as possible, choose $\theta^{t+1}$ so that $B(\theta, \theta^{t})$ is maximized, then:

$$
\begin{aligned}
\theta^{t+1} &= \argmax_{\theta} B(\theta, \theta^{t}) \\
&= \argmax_{\theta}  {\sum_{Z} P(Z|Y, \theta^{t}) log(\frac{P(Y, Z|\theta)}{P(Z|Y, \theta^{t})}}) \\
&= \argmax_{\theta}  \sum_{Z} P(Z|Y, \theta^{t}) logP(Y, Z|\theta)\\
&= \argmax_{\theta} \mathbb{E}_{Z|X,\theta^t}[logP(X,Z|\theta)]\\
\end{aligned}
$$

Denote $\mathbb{E}_{Z|X,\theta^t}[logP(X,Z|\theta)]$ as $Q(\theta, \theta^t)$, which is the core of the EM algorithm, `Q-function`.

**Definition of the Q function: the expectation of the log-likelihood function of the complete data $logP(Y,Z|\theta)$ with respect to the conditional probability distribution $logP(Z|Y,\theta)$ of the unobserved data $Z$, given the observed data $Y$ and the current parameters $\theta^{t}$, is called the Q function.**

The EM algorithm then proceeds as follows:

Initialization: choose parameter $\theta^{0}$ to initialize the values.

1. E-step: compute $Q(\theta, \theta^t)$
2. M-step: compute $\theta^{t+1} = \argmax_{\theta} Q(\theta, \theta^t)$

Repeat steps 1 and 2 until convergence. Typically a fixed number of iterations or $|\theta^{t+1}-\theta^{t}| < \epsilon$ is set as the stopping criterion.

Property of the EM algorithm: since the EM algorithm requires initial values, it is somewhat sensitive to initialization.

## Proof of EM Algorithm Convergence

Theorem 1: Let $P(Y|\theta)$ be the likelihood function of the observed data, $\theta^{t}$ be the sequence of parameter estimates obtained by the EM algorithm, and $P(Y|\theta^{t})$ be the corresponding sequence of likelihood functions. Then $P(Y|\theta^{t})$ is monotonically increasing, that is, $P(Y|\theta^{t+1}) \geq P(Y|\theta^{t})$

Proof:

$$
\begin{aligned}
P(Y|\theta^{t}) &= \log P(Y, Z|\theta)-\log P(Z|Y, \theta) \\
&=\sum_{z} \log P(Y, Z | \theta) P\left(Z | Y, \theta^{t}\right) - \sum_{Z} \log P(Z | Y, \theta) P\left(Z | Y, \theta^{t}\right) \\ 
&= Q\left(\theta, \theta^{t}\right) -\sum_{Z} \log P(Z | Y, \theta) P\left(Z | Y, \theta^{t}\right)
\end{aligned}
$$

Let

$$
H\left(\theta, \theta^{t}\right)=\sum_{Z} \log P(Z | Y, \theta) P\left(Z | Y, \theta^{t}\right)
$$
then

$$
P(Y|\theta^{t}) = Q\left(\theta, \theta^{t}\right) - H\left(\theta, \theta^{t}\right)
$$

From the above we know that $Q\left(\theta^{t+1}, \theta^{t}\right) > \left(\theta^{t}, \theta^{t}\right)$

In addition, for $H\left(\theta, \theta^{t}\right)$ we have the following relation:

$$
\begin{aligned}
H\left(\theta^{t+1}, \theta^{t}\right) - H\left(\theta^{t}, \theta^{t}\right) & = \sum_{Z} [\log P(Z|Y, \theta^{t+1}) - log P(Z|Y, \theta^{t})] P\left(Z | Y, \theta^{t}\right) \\
&= \sum_{Z} \log [P(Z|Y, \theta^{t+1})/P(Z|Y, \theta^{t})] P\left(Z | Y, \theta^{t}\right) \\
&= -D_{KL}(P(Z|Y,\theta^{t})||P(Z|Y,\theta^{t+1}))
\end{aligned}
$$

Since the KL divergence is non-negative, $H\left(\theta^{t+1}, \theta^{t}\right) - H\left(\theta^{t}, \theta^{t}\right) \leq 0$

Therefore $P(Y|\theta^{t})$ is increasing, which completes the proof. Hence using the EM algorithm, $P(Y|\theta^{t})$ converges.

## Applications of the EM Algorithm

The core of the EM algorithm is learning under unsupervised or weakly supervised conditions. The key reason is that in the unsupervised setting, the data we get is $\{(x_1,),(x_2,)...,(x_N,)\}$, and the data contains no labels $y$. We can treat $Y$ as unobserved latent variables. Therefore, EM is mainly used for unsupervised training of generative models, where in the generative model's $P(X,Y)$, $X$ is the observed data and $Y$ is the latent variable.

## Implementing the EM Algorithm (Python)

Placeholder, to be determined

References
--------
https://www.hrwhisper.me/machine-learning-em-algorithm/

https://www.cnblogs.com/jerrylead/archive/2011/04/06/2006936.html

*Statistical Learning Methods*, Li Hang
