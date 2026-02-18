import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscordNotifier, DiscordConfig } from '../../src/notifications/DiscordNotifier.js';

describe('DiscordNotifier', () => {
  let notifier: DiscordNotifier;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const config: DiscordConfig = {
      webhookUrl: 'https://discord.com/api/webhooks/test',
      enabled: true,
      alertLevel: 'all',
      username: 'Test Bot',
    };
    notifier = new DiscordNotifier(config);
    
    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('Configuration', () => {
    it('should have correct initial configuration', () => {
      const config = notifier.getConfig();
      expect(config.webhookUrl).toBe('https://discord.com/api/webhooks/test');
      expect(config.enabled).toBe(true);
      expect(config.alertLevel).toBe('all');
      expect(config.username).toBe('Test Bot');
    });

    it('should update configuration', () => {
      notifier.updateConfig({ alertLevel: 'errors-only' });
      const config = notifier.getConfig();
      expect(config.alertLevel).toBe('errors-only');
      expect(config.enabled).toBe(true); // Unchanged
    });

    it('should report enabled when configured correctly', () => {
      expect(notifier.isEnabled()).toBe(true);
    });

    it('should report disabled when not configured', () => {
      notifier.updateConfig({ webhookUrl: '' });
      expect(notifier.isEnabled()).toBe(false);
    });

    it('should report disabled when explicitly disabled', () => {
      notifier.updateConfig({ enabled: false });
      expect(notifier.isEnabled()).toBe(false);
    });
  });

  describe('Alert Level Filtering', () => {
    it('should send all alerts when level is all', () => {
      expect(notifier.shouldSend('trade')).toBe(true);
      expect(notifier.shouldSend('profit')).toBe(true);
      expect(notifier.shouldSend('error')).toBe(true);
      expect(notifier.shouldSend('warning')).toBe(true);
      expect(notifier.shouldSend('summary')).toBe(true);
    });

    it('should only send trades when level is trades-only', () => {
      notifier.updateConfig({ alertLevel: 'trades-only' });
      expect(notifier.shouldSend('trade')).toBe(true);
      expect(notifier.shouldSend('profit')).toBe(true);
      expect(notifier.shouldSend('error')).toBe(false);
      expect(notifier.shouldSend('warning')).toBe(false);
    });

    it('should only send errors when level is errors-only', () => {
      notifier.updateConfig({ alertLevel: 'errors-only' });
      expect(notifier.shouldSend('trade')).toBe(false);
      expect(notifier.shouldSend('profit')).toBe(false);
      expect(notifier.shouldSend('error')).toBe(true);
      expect(notifier.shouldSend('warning')).toBe(true);
    });

    it('should send nothing when level is none', () => {
      notifier.updateConfig({ alertLevel: 'none' });
      expect(notifier.shouldSend('trade')).toBe(false);
      expect(notifier.shouldSend('error')).toBe(false);
    });
  });

  describe('Message Sending', () => {
    it('should send message successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.sendMessage('Test message');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should return false when disabled', async () => {
      notifier.updateConfig({ enabled: false });
      const result = await notifier.sendMessage('Test');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await notifier.sendMessage('Test');

      expect(result).toBe(false);
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ 
        ok: false, 
        status: 404,
        text: async () => 'Not found'
      });

      const result = await notifier.sendMessage('Test');

      expect(result).toBe(false);
    });
  });

  describe('Trade Notifications', () => {
    it('should send buy trade notification', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyTrade(
        'TestBot',
        'TEST',
        'buy',
        '1000',
        '0.001',
        5,
        '0xtxhash'
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].title).toContain('BUY');
      expect(callBody.embeds[0].fields).toContainEqual(
        expect.objectContaining({ name: '📍 Position', value: '#5' })
      );
    });

    it('should send sell trade notification', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyTrade(
        'TestBot',
        'TEST',
        'sell',
        '1000',
        '0.001'
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].title).toContain('SELL');
    });

    it('should not send when filtered by alert level', async () => {
      notifier.updateConfig({ alertLevel: 'errors-only' });
      const result = await notifier.notifyTrade('TestBot', 'TEST', 'buy', '100', '0.001');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Profit Notifications', () => {
    it('should send profit notification', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyProfit(
        'TestBot',
        'TEST',
        8.5,
        '0.0001',
        3
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].title).toContain('Profit');
      expect(callBody.embeds[0].color).toBe(0x00ff00);
    });

    it('should show negative profit in red', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await notifier.notifyProfit('TestBot', 'TEST', -5, '-0.0001');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].color).toBe(0xff0000);
    });
  });

  describe('Error Notifications', () => {
    it('should send error notification with mention', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyError(
        'TestBot',
        'Something went wrong',
        'During buy'
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.content).toBe('@here');
      expect(callBody.embeds[0].title).toContain('Error');
      expect(callBody.embeds[0].color).toBe(0xff0000);
    });
  });

  describe('Warning Notifications', () => {
    it('should send warning notification', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyWarning(
        'TestBot',
        'Low balance',
        'Deposit more ETH'
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].title).toContain('Warning');
      expect(callBody.embeds[0].color).toBe(0xffa500);
    });
  });

  describe('Daily Summary', () => {
    it('should send daily summary', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.sendDailySummary(
        '2026-02-17',
        '0.05',
        10,
        5,
        5,
        3
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.embeds[0].title).toContain('Daily Summary');
      expect(callBody.embeds[0].fields).toHaveLength(5);
    });
  });

  describe('Circuit Breaker Notification', () => {
    it('should send circuit breaker notification with everyone mention', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.notifyCircuitBreaker(
        'Daily loss limit reached',
        12.5,
        60
      );

      expect(result).toBe(true);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.content).toBe('@everyone');
      expect(callBody.embeds[0].title).toContain('Circuit Breaker');
      expect(callBody.embeds[0].color).toBe(0xff0000);
    });
  });

  describe('Test Notification', () => {
    it('should send test notification when configured', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await notifier.sendTestMessage();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });

    it('should fail test when not configured', async () => {
      notifier.updateConfig({ webhookUrl: '' });

      const result = await notifier.sendTestMessage();

      expect(result.success).toBe(false);
      expect(result.message).toContain('not configured');
    });
  });

  describe('Error Tracking', () => {
    it('should track last error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      await notifier.sendMessage('Test');

      const lastError = notifier.getLastError();
      expect(lastError).toBeDefined();
      expect(lastError?.message).toContain('Network failed');
      expect(lastError?.time).toBeGreaterThan(0);
    });
  });
});
