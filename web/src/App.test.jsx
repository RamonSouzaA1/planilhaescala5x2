import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App.jsx';

describe('App', () => {
  it('renderiza o título Planilha Escala 5x2', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Planilha Escala 5x2' })).toBeInTheDocument();
  });
});
