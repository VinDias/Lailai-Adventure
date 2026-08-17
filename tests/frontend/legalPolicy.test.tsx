import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LegalPolicy from '../../components/LegalPolicy';

// Achado da revisão final (item 9): o texto dizia que o registro de progresso
// "é apagado quando você limpa os dados do navegador" — impreciso. Limpar o
// navegador descarta o IDENTIFICADOR; o documento em si continua no servidor
// até o prazo de 180 dias sem uso (ver models/ReadingProgress.js, índice TTL).
describe('LegalPolicy — texto sobre progresso de leitura', () => {
  it('nao afirma mais que limpar o navegador apaga o registro do servidor', () => {
    render(<LegalPolicy open={true} onClose={() => {}} initialTab="privacy" />);
    const secao = screen.getByText(/Progresso de leitura/i).closest('li')!;
    expect(secao.textContent).not.toMatch(/é apagado quando você limpa os dados do navegador/i);
  });

  it('explica que limpar o navegador so desassocia o identificador, e que o apagamento do servidor e por prazo (180 dias)', () => {
    render(<LegalPolicy open={true} onClose={() => {}} initialTab="privacy" />);
    const secao = screen.getByText(/Progresso de leitura/i).closest('li')!;
    expect(secao.textContent).toMatch(/deixa de ser associado a você quando você limpa os dados do navegador/i);
    expect(secao.textContent).toMatch(/apagado do servidor após 180 dias sem uso/i);
  });
});
