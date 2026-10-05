import { describe, expect, it } from 'vitest';
import {
  classifyLLMErrorToCode,
  LLM_ERROR_CODES,
  UPSTREAM_STATUS_CODE_MAP,
} from '@mavis/shared/llm-error-classifier';

describe('classifyLLMErrorToCode - MiniMax business codes', () => {
  it('maps typed MiniMax error codes correctly even under 520 or 5xx status', () => {
    // 1000 -> LLM_UPSTREAM_ERROR (50113)
    const err1000 = classifyLLMErrorToCode({
      statusCode: 520,
      errorCode: 1000,
      message: 'unknown error',
    });
    expect(err1000?.status_code).toBe(LLM_ERROR_CODES.LLM_UPSTREAM_ERROR);

    // 1004 -> LLM_AUTH_ERROR (50112)
    const err1004 = classifyLLMErrorToCode({
      statusCode: 520,
      errorCode: 1004,
      message: 'auth error',
    });
    expect(err1004?.status_code).toBe(LLM_ERROR_CODES.LLM_AUTH_ERROR);

    // 1008 -> LLM_CREDITS_EXHAUSTED (50110)
    const err1008 = classifyLLMErrorToCode({
      statusCode: 520,
      errorCode: 1008,
      message: 'insufficient balance',
    });
    expect(err1008?.status_code).toBe(LLM_ERROR_CODES.LLM_CREDITS_EXHAUSTED);

    // 1002 -> LLM_RATE_LIMITED (50111)
    const err1002 = classifyLLMErrorToCode({
      statusCode: 520,
      errorCode: 1002,
      message: 'rate limit',
    });
    expect(err1002?.status_code).toBe(LLM_ERROR_CODES.LLM_RATE_LIMITED);

    // 1039 -> LLM_TPM_RATE_LIMITED (50150)
    const err1039 = classifyLLMErrorToCode({
      statusCode: 520,
      errorCode: 1039,
      message: 'tpm limit',
    });
    expect(err1039?.status_code).toBe(LLM_ERROR_CODES.LLM_TPM_RATE_LIMITED);
  });

  it('recovers business error codes from message strings', () => {
    const fromStr520 = classifyLLMErrorToCode('unknown error, 520 (1000)');
    expect(fromStr520?.status_code).toBe(LLM_ERROR_CODES.LLM_UPSTREAM_ERROR);

    const fromStr1008 = classifyLLMErrorToCode('upstream failure (1008)');
    expect(fromStr1008?.status_code).toBe(LLM_ERROR_CODES.LLM_CREDITS_EXHAUSTED);

    const fromStr1004 = classifyLLMErrorToCode('token invalid (1004)');
    expect(fromStr1004?.status_code).toBe(LLM_ERROR_CODES.LLM_AUTH_ERROR);
  });

  it('includes all documented MiniMax codes in UPSTREAM_STATUS_CODE_MAP', () => {
    expect(UPSTREAM_STATUS_CODE_MAP[1000]).toBe(LLM_ERROR_CODES.LLM_UPSTREAM_ERROR);
    expect(UPSTREAM_STATUS_CODE_MAP[1001]).toBe(LLM_ERROR_CODES.LLM_UPSTREAM_ERROR);
    expect(UPSTREAM_STATUS_CODE_MAP[1002]).toBe(LLM_ERROR_CODES.LLM_RATE_LIMITED);
    expect(UPSTREAM_STATUS_CODE_MAP[1004]).toBe(LLM_ERROR_CODES.LLM_AUTH_ERROR);
    expect(UPSTREAM_STATUS_CODE_MAP[1008]).toBe(LLM_ERROR_CODES.LLM_CREDITS_EXHAUSTED);
    expect(UPSTREAM_STATUS_CODE_MAP[1039]).toBe(LLM_ERROR_CODES.LLM_TPM_RATE_LIMITED);
    expect(UPSTREAM_STATUS_CODE_MAP[2056]).toBe(LLM_ERROR_CODES.USAGE_LIMIT_EXCEEDED);
  });
});
