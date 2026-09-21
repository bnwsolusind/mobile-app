/**
 * SIMS Terpadu - Mobile Realtime WebSocket & Event Stream Client
 * Zero-Delay synchronization for Live Activity Timeline & Instant Chat
 */

import { Platform } from 'react-native';
import { API_BASE_URL, api } from './api';

export type RealtimeEventHandler = (data: {
  channel: string;
  event: string;
  payload: any;
  sender_id?: string;
  timestamp?: string;
}) => void;

class RealtimeWebSocketService {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private subscribers = new Map<string, Set<RealtimeEventHandler>>();
  private pollingTimer: any = null;
  private lastPolledEventId: string | null = null;
  private isPollingActive = false;

  constructor() {
    this.connect();
  }

  /**
   * Derive WebSocket URL from API_BASE_URL
   */
  private getWebSocketUrl(): string {
    try {
      const url = new URL(API_BASE_URL);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = url.hostname;
      const port = process.env.EXPO_PUBLIC_WS_PORT || '6001';
      return `${protocol}//${hostname}:${port}`;
    } catch {
      return Platform.OS === 'android' ? 'ws://10.0.2.2:6001' : 'ws://127.0.0.1:6001';
    }
  }

  /**
   * Connect to WebSocket Gateway server
   */
  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = this.getWebSocketUrl();
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.stopPollingFallback();

        // Re-subscribe to all active channels
        for (const channel of this.subscribers.keys()) {
          this.send({ action: 'subscribe', channel });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const channel = data.channel;

          if (channel && this.subscribers.has(channel)) {
            const handlers = this.subscribers.get(channel);
            if (handlers) {
              handlers.forEach((handler) => handler(data));
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.startPollingFallback();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.startPollingFallback();
        this.scheduleReconnect();
      };
    } catch {
      this.isConnected = false;
      this.startPollingFallback();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send JSON action payload over WebSocket
   */
  public send(payload: Record<string, any>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Subscribe to a channel (e.g. 'student.xxx' or 'user.yyy')
   * Returns an unsubscribe function.
   */
  public subscribe(channel: string, handler: RealtimeEventHandler): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
      this.send({ action: 'subscribe', channel });
    }

    this.subscribers.get(channel)!.add(handler);

    // If socket is not yet open, ensure it connects
    if (!this.isConnected) {
      this.connect();
    }

    return () => {
      this.unsubscribe(channel, handler);
    };
  }

  /**
   * Unsubscribe a handler from a channel
   */
  public unsubscribe(channel: string, handler: RealtimeEventHandler) {
    const handlers = this.subscribers.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(channel);
        this.send({ action: 'unsubscribe', channel });
      }
    }
  }

  /**
   * Smart Polling Fallback if WebSocket is blocked
   */
  private startPollingFallback() {
    if (this.isPollingActive || this.pollingTimer) return;
    this.isPollingActive = true;

    // Poll every 1.5s for near-instant responsiveness when socket is offline
    this.pollingTimer = setInterval(async () => {
      if (this.isConnected) {
        this.stopPollingFallback();
        return;
      }

      if (this.subscribers.size === 0) return;

      try {
        const res = await api.get('/realtime/poll', {
          params: { since_id: this.lastPolledEventId || undefined },
        });
        const events = res?.data?.events || [];
        if (Array.isArray(events) && events.length > 0) {
          for (const ev of events) {
            this.lastPolledEventId = ev.id;
            const handlers = this.subscribers.get(ev.channel);
            if (handlers) {
              handlers.forEach((handler) => handler(ev));
            }
          }
        }
      } catch {
        // Silent fail
      }
    }, 1500);
  }

  private stopPollingFallback() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPollingActive = false;
  }
}

export const realtimeWs = new RealtimeWebSocketService();
