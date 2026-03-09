import { describe, it, expect, beforeEach } from 'vitest';
import { resetShopify, resetSlack } from '../setup/seeders.js';

describe('UI Structure Smoke Tests (INFRA-13)', () => {
  beforeEach(async () => {
    await resetShopify();
    await resetSlack();
  });

  describe('Shopify twin UI', () => {
    const shopifyUrl = () => process.env.SHOPIFY_API_URL!;

    it('GET /ui/orders returns HTTP 200 with HTML', async () => {
      const res = await fetch(shopifyUrl() + '/ui/orders');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('/ui/orders body contains table or list markup', async () => {
      const res = await fetch(shopifyUrl() + '/ui/orders');
      const html = await res.text();
      // Expect either table rows, list items, or a 'no orders' message
      expect(html.length).toBeGreaterThan(100); // not blank
      expect(html).toMatch(/<html|<body|<table|<ul|<div/i);
    });

    it('GET /ui/products returns HTTP 200 with HTML', async () => {
      const res = await fetch(shopifyUrl() + '/ui/products');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('GET /ui/customers returns HTTP 200 with HTML', async () => {
      const res = await fetch(shopifyUrl() + '/ui/customers');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('Slack twin UI', () => {
    const slackUrl = () => process.env.SLACK_API_URL!;

    it('GET /ui returns HTTP 200 with HTML', async () => {
      const res = await fetch(slackUrl() + '/ui');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('/ui body contains structural HTML elements', async () => {
      const res = await fetch(slackUrl() + '/ui');
      const html = await res.text();
      expect(html.length).toBeGreaterThan(100);
      expect(html).toMatch(/<html|<body|<table|<ul|<div/i);
    });
  });
});
