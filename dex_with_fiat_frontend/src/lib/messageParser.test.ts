import { describe, it, expect } from 'vitest';
import { parseMessage, mergeParserWithAI } from './messageParser';
import type { TransactionData } from '@/types';

describe('parseMessage', () => {
  describe('amount extraction', () => {
    it('extracts a plain integer', () => {
      expect(parseMessage('deposit 500 XLM').amount).toBe('500');
    });

    it('extracts a decimal amount', () => {
      expect(parseMessage('send 50.5 XLM').amount).toBe('50.5');
    });

    it('extracts a comma-separated amount', () => {
      expect(parseMessage('convert 1,000 XLM to naira').amount).toBe('1000');
    });

    it('extracts a large comma-separated decimal', () => {
      expect(parseMessage('I want to deposit 1,250.75 lumens').amount).toBe(
        '1250.75',
      );
    });

    it('returns undefined when no number is present', () => {
      expect(parseMessage('convert XLM to NGN').amount).toBeUndefined();
    });

    it('ignores zero amounts', () => {
      expect(parseMessage('deposit 0 XLM').amount).toBeUndefined();
    });
  });

  describe('token extraction', () => {
    it('detects XLM', () => {
      expect(parseMessage('deposit 100 XLM').token).toBe('XLM');
    });

    it('detects "lumens" as XLM', () => {
      expect(parseMessage('send 50 lumens').token).toBe('XLM');
    });

    it('detects "stellar" as XLM', () => {
      expect(parseMessage('convert my stellar to fiat').token).toBe('XLM');
    });

    it('is case-insensitive', () => {
      expect(parseMessage('Deposit 200 xlm').token).toBe('XLM');
    });

    it('returns undefined when no token keyword is found', () => {
      expect(parseMessage('deposit 100 to naira').token).toBeUndefined();
    });
  });

  describe('fiat currency extraction', () => {
    it('detects NGN', () => {
      expect(parseMessage('convert 100 XLM to NGN').fiatCurrency).toBe('NGN');
    });

    it('detects "naira"', () => {
      expect(parseMessage('convert to naira').fiatCurrency).toBe('NGN');
    });

    it('detects USD', () => {
      expect(parseMessage('I want USD').fiatCurrency).toBe('USD');
    });

    it('detects "dollars"', () => {
      expect(parseMessage('convert to dollars').fiatCurrency).toBe('USD');
    });

    it('detects EUR', () => {
      expect(parseMessage('payout in EUR please').fiatCurrency).toBe('EUR');
    });

    it('detects "euro"', () => {
      expect(parseMessage('convert to euro').fiatCurrency).toBe('EUR');
    });

    it('detects ₦ symbol', () => {
      expect(parseMessage('I want ₦50000 worth').fiatCurrency).toBe('NGN');
    });

    it('detects $ symbol', () => {
      expect(parseMessage('convert to $500').fiatCurrency).toBe('USD');
    });

    it('detects GBP / pounds', () => {
      expect(parseMessage('I want pounds').fiatCurrency).toBe('GBP');
    });

    it('returns undefined when no fiat is mentioned', () => {
      expect(parseMessage('deposit 100 XLM').fiatCurrency).toBeUndefined();
    });
  });

  describe('full message extraction', () => {
    it('parses a complete conversion request', () => {
      const result = parseMessage('I want to convert 500 XLM to NGN');
      expect(result).toEqual({
        amount: '500',
        token: 'XLM',
        fiatCurrency: 'NGN',
      });
    });

    it('parses a deposit request', () => {
      const result = parseMessage('deposit 1,000.50 lumens');
      expect(result).toEqual({
        amount: '1000.50',
        token: 'XLM',
        fiatCurrency: undefined,
      });
    });

    it('handles a greeting with no extractable data', () => {
      const result = parseMessage('hello, how are you?');
      expect(result).toEqual({
        amount: undefined,
        token: undefined,
        fiatCurrency: undefined,
      });
    });

    it('handles empty string', () => {
      const result = parseMessage('');
      expect(result).toEqual({});
    });

    it('handles whitespace-only string', () => {
      const result = parseMessage('   ');
      expect(result).toEqual({});
    });
  });
});

describe('mergeParserWithAI', () => {
  it('uses parser amount over AI amount', () => {
    const parser = { amount: '500', token: 'XLM', fiatCurrency: 'NGN' };
    const ai: Partial<TransactionData> = {
      type: 'fiat_conversion',
      amountIn: '5000',
      tokenIn: 'XLM',
      fiatCurrency: 'NGN',
    };
    const merged = mergeParserWithAI(parser, ai);
    expect(merged.amountIn).toBe('500');
  });

  it('preserves AI fields when parser has no opinion', () => {
    const parser = { amount: '100' };
    const ai: Partial<TransactionData> = {
      type: 'fiat_conversion',
      amountIn: '200',
      tokenIn: 'XLM',
      fiatCurrency: 'NGN',
      recipient: 'bank-account-xyz',
    };
    const merged = mergeParserWithAI(parser, ai);
    expect(merged.amountIn).toBe('100');
    expect(merged.tokenIn).toBe('XLM');
    expect(merged.fiatCurrency).toBe('NGN');
    expect(merged.recipient).toBe('bank-account-xyz');
  });

  it('does not override AI fields with undefined', () => {
    const parser = {};
    const ai: Partial<TransactionData> = {
      type: 'fiat_conversion',
      amountIn: '300',
      tokenIn: 'XLM',
    };
    const merged = mergeParserWithAI(parser, ai);
    expect(merged.amountIn).toBe('300');
    expect(merged.tokenIn).toBe('XLM');
  });

  it('parser fills in fields AI missed', () => {
    const parser = { amount: '750', fiatCurrency: 'EUR' };
    const ai: Partial<TransactionData> = {
      type: 'fiat_conversion',
      tokenIn: 'XLM',
    };
    const merged = mergeParserWithAI(parser, ai);
    expect(merged.amountIn).toBe('750');
    expect(merged.fiatCurrency).toBe('EUR');
    expect(merged.tokenIn).toBe('XLM');
  });
});
