import { streamSimple, type Api, type AssistantMessage, type Context, type Model } from '@earendil-works/pi-ai';
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import { LLM_RETRY_CALL_IDENTITY } from '@mavis/agent-core/pi-turn-runner';
import {
  createDefaultTokenEstimator,
  DEFAULT_CONTEXT_MANAGER_SETTINGS,
  resolveDynamicMaxTokens,
} from '@mavis/context-manager';

const MIN_OUTPUT_TOKENS = 1_024;
const EMERGENCY_OUTPUT_TOKENS = 1;
const prunedContextMessageLists = new WeakSet<readonly unknown[]>();
const prunedCheckpointHistories = new WeakSet<readonly unknown[]>();
const staleUsageAssistants = new WeakSet<object>();

export function markPrunedContextMessages(messages: readonly unknown[]): void {
  prunedContextMessageLists.add(messages);
}

export function markPrunedCheckpointHistory(messages: readonly unknown[]): void {
  prunedCheckpointHistories.add(messages);
}

export function isPrunedCheckpointHistory(messages: readonly unknown[]): boolean {
  return prunedCheckpointHistories.has(messages);
}

export function markStaleAssistantUsage(messages: readonly AgentMessage[]): void {
  for (const message of messages) {
    if (message && typeof message === 'object' && message.role === 'assistant') {
      staleUsageAssistants.add(message);
    }
  }
}
const PI_DEFAULT_THINKING_BUDGETS: Readonly<Record<string, number>> = {
  minimal: 1_024,
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};

interface DynamicBudget {
  readonly maxTokens: number;
  readonly disableReasoning: boolean;
}

interface BudgetedCall {
  readonly stream: StreamFn;
  readonly model: Model<Api>;
  readonly context: Context;
  readonly options: Parameters<StreamFn>[2];
  readonly budget: DynamicBudget;
}

function estimatePiContextTokens(model: Model<Api>, context: Context): number {
  const estimator = createDefaultTokenEstimator();
  const rawMessages = context.messages ?? [];
  const messages = [...rawMessages] as AgentMessage[];
  const systemTokens = context.systemPrompt
    ? estimator.estimateTextTokens(context.systemPrompt)
    : 0;
  const toolTokens = (context.tools ?? []).reduce(
    (tokens, tool) =>
      tokens +
      estimator.estimateTextTokens(
        [tool.name ?? '', tool.description ?? '', safeJson(tool.parameters)].join('\n'),
      ),
    0,
  );
  const bpeTotal = estimator.estimateMessages(messages) + systemTokens + toolTokens;
  if (prunedContextMessageLists.has(rawMessages)) {
    return bpeTotal;
  }
  const anchored = resolvePersistedContextUsage(model, messages);
  if (!anchored) {
    return bpeTotal;
  }
  return Math.max(bpeTotal, anchored.absoluteTokens + estimator.estimateMessages(anchored.trailing));
}

function resolvePersistedContextUsage(
  model: Model<Api>,
  messages: readonly AgentMessage[],
): { readonly absoluteTokens: number; readonly trailing: AgentMessage[] } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') continue;
    if ((message as { role?: string }).role === 'compactionSummary') return undefined;
    if (message.role !== 'assistant') continue;
    if (staleUsageAssistants.has(message)) continue;
    const assistant = message as AssistantMessage;
    if (
      assistant.provider !== model.provider ||
      assistant.api !== model.api ||
      assistant.model !== model.id ||
      assistant.stopReason === 'error' ||
      assistant.stopReason === 'aborted'
    ) {
      continue;
    }
    const absoluteTokens = readSettledAssistantTokens(assistant.usage);
    if (absoluteTokens === undefined) continue;
    return {
      absoluteTokens,
      trailing: messages.slice(index + 1),
    };
  }
  return undefined;
}

function readSettledAssistantTokens(usage: AssistantMessage['usage'] | undefined): number | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const valid = (n: unknown): number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  const total = valid(usage.totalTokens);
  if (total > 0) return total;
  const components =
    valid(usage.input) + valid(usage.cacheRead) + valid(usage.cacheWrite) + valid(usage.output);
  return components > 0 ? components : undefined;
}

/**
 * Keeps the v2 provider request consistent with the 16k reserve used by its
 * compaction trigger. The wrapper is synchronous, so it uses the current
 * complete Pi context and the bounded shared estimator.
 */
export function withLocalDynamicMaxTokens(inner?: StreamFn): StreamFn {
  const base: StreamFn = inner ?? streamSimple;
  const retryBudgets = new WeakMap<object, DynamicBudget>();
  return (model, context, options) => {
    const contextWindow = positive(model.contextWindow);
    const configured = positive(options?.maxTokens) || positive(model.maxTokens);
    if (!contextWindow || !configured) return base(model, context, options);
    const retryIdentity = (
      options as (typeof options & { [LLM_RETRY_CALL_IDENTITY]?: object }) | undefined
    )?.[LLM_RETRY_CALL_IDENTITY];
    const retryBudget = retryIdentity ? retryBudgets.get(retryIdentity) : undefined;
    if (retryBudget) {
      return callWithBudget({ stream: base, model, context, options, budget: retryBudget });
    }

    const budget = resolveCallBudget({ model, context, options, contextWindow, configured });
    if (retryIdentity) retryBudgets.set(retryIdentity, budget);
    return budget.maxTokens >= configured
      ? base(model, context, options)
      : callWithBudget({ stream: base, model, context, options, budget });
  };
}

function resolveCallBudget(input: {
  readonly model: Model<Api>;
  readonly context: Context;
  readonly options: Parameters<StreamFn>[2];
  readonly contextWindow: number;
  readonly configured: number;
}): DynamicBudget {
  try {
    const estimated = estimatePiContextTokens(input.model, input.context);
    const desired = resolveDynamicMaxTokens({
      contextWindow: input.contextWindow,
      configuredMaxTokens: input.configured,
      estimatedContextTokens: estimated,
    });
    const available = Math.max(
      0,
      input.contextWindow - DEFAULT_CONTEXT_MANAGER_SETTINGS.safetyMarginTokens - estimated,
    );
    const ceiling = Math.floor(Math.min(desired, available));
    if (ceiling >= desired && desired >= input.configured) {
      return { maxTokens: input.configured, disableReasoning: false };
    }
    if (ceiling < MIN_OUTPUT_TOKENS) {
      return {
        maxTokens: Math.max(EMERGENCY_OUTPUT_TOKENS, ceiling),
        disableReasoning: true,
      };
    }
    const thinkingBudget = thinkingBudgetTokens(input.model, input.options);
    if (thinkingBudget > 0 && ceiling - thinkingBudget < MIN_OUTPUT_TOKENS) {
      return {
        maxTokens: ceiling,
        disableReasoning: true,
      };
    }
    return {
      maxTokens: Math.max(MIN_OUTPUT_TOKENS, ceiling - thinkingBudget),
      disableReasoning: false,
    };
  } catch {
    return { maxTokens: EMERGENCY_OUTPUT_TOKENS, disableReasoning: true };
  }
}

function callWithBudget(input: BudgetedCall) {
  return input.stream(input.model, input.context, {
    ...(input.options ?? {}),
    maxTokens: input.budget.maxTokens,
    ...(input.budget.disableReasoning ? { reasoning: undefined } : {}),
  });
}

function thinkingBudgetTokens(model: Model<Api>, options: Parameters<StreamFn>[2]): number {
  if (model.api !== 'anthropic-messages') return 0;
  const reasoning = options?.reasoning;
  if (!reasoning) return 0;
  if (model.compat && Reflect.get(model.compat, 'forceAdaptiveThinking') === true) return 0;
  const level = reasoning === 'xhigh' || reasoning === 'max' ? 'high' : reasoning;
  return options?.thinkingBudgets?.[level] ?? PI_DEFAULT_THINKING_BUDGETS[level] ?? 0;
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}
