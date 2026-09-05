import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escapeHtml.js';

describe('escapeHtml', () => {
  it('escapa os 5 caracteres especiais de HTML', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('neutraliza uma tag com handler de evento (achado real da auditoria de 2026-08-29)', () => {
    const payload = '<img src=x onerror="alert(document.cookie)">';
    const escapado = escapeHtml(payload);

    expect(escapado).not.toContain('<img');
    expect(escapado).toBe('&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;');
  });

  it('texto sem caractere especial passa inalterado', () => {
    expect(escapeHtml('João da Silva')).toBe('João da Silva');
  });

  it('escapa `&` antes dos outros, sem re-escapar as entidades já geradas', () => {
    expect(escapeHtml('<>')).toBe('&lt;&gt;');
  });
});
