import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { buildExportJson, downloadJson, exportFilename, hasLocalData, removeAppKeys } from '../features/privacy/localData.js';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2';
const btnPrimary = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600`;
const btnSecondary = `${btnBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-emerald-600`;
const btnDanger = `${btnBase} bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600`;

const reloadPage = () => window.location.reload();

/**
 * Tela amigável quando algo quebra na renderização. Não mostra stack trace ao usuário
 * (vai para o console) e não depende do store, que pode ser justamente o que quebrou.
 */
export class ErrorBoundary extends Component {
  state = { failed: false, confirmingWipe: false, exportMessage: '' };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Falha ao renderizar o app', error, info?.componentStack);
  }

  handleExport = () => {
    if (!hasLocalData()) {
      this.setState({ exportMessage: 'Não há dados salvos neste navegador para exportar.' });
      return;
    }
    try {
      downloadJson(exportFilename(), buildExportJson());
      this.setState({ exportMessage: 'Arquivo gerado. Guarde-o em um lugar seguro.' });
    } catch (error) {
      console.error('Falha ao exportar dados', error);
      this.setState({ exportMessage: 'Não foi possível gerar o arquivo de exportação.' });
    }
  };

  handleWipe = () => {
    removeAppKeys();
    (this.props.onReload ?? reloadPage)();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const { confirmingWipe, exportMessage } = this.state;
    const reload = this.props.onReload ?? reloadPage;

    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4 text-sm text-slate-900">
        <div role="alert" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-500">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h1 className="text-base font-semibold">Algo deu errado ao abrir sua escala</h1>
              <p className="mt-1 text-slate-600">
                Seus dados continuam salvos neste navegador. Tente abrir de novo; se o problema continuar, exporte uma cópia
                dos dados antes de recomeçar.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className={btnPrimary} onClick={reload}>
              Tentar de novo
            </button>
            <button type="button" className={btnSecondary} onClick={this.handleExport}>
              Exportar meus dados
            </button>
            {exportMessage && (
              <p role="status" className="text-xs text-slate-600">
                {exportMessage}
              </p>
            )}
            {!confirmingWipe ? (
              <button type="button" className={btnSecondary} onClick={() => this.setState({ confirmingWipe: true })}>
                Apagar dados deste navegador e recomeçar
              </button>
            ) : (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-medium text-rose-900">
                  Isso apaga toda a escala e a equipe salvas neste navegador. Não dá para desfazer.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={btnDanger} onClick={this.handleWipe}>
                    Sim, apagar e recomeçar
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => this.setState({ confirmingWipe: false })}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
