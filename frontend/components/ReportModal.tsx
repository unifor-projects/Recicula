'use client';

import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/services/api';
import Button from './Button';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'anuncio' | 'usuario';
  alvoId: number;
}

const REPORT_REASONS = [
  'Conteúdo inapropriado',
  'Golpe ou Spam',
  'Comportamento ofensivo',
  'Produto proibido',
  'Outros',
];

export default function ReportModal({ isOpen, onClose, tipo, alvoId }: ReportModalProps) {
  const [motivo, setMotivo] = useState(REPORT_REASONS[0]);
  const [descricao, setDescricao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!motivo) {
      toast.error('Por favor, selecione um motivo para a denúncia.');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/denuncias/', {
        tipo,
        alvo_id: alvoId,
        motivo,
        descricao: descricao.trim() || undefined,
      });

      toast.success('Denúncia enviada com sucesso. Agradecemos sua colaboração!');
      setDescricao('');
      setMotivo(REPORT_REASONS[0]);
      onClose();
    } catch (error: unknown) {
      let message = 'Não foi possível enviar a denúncia.';
      if (axios.isAxiosError(error)) {
        const apiMessage = error.response?.data?.detail;
        if (typeof apiMessage === 'string') {
          message = apiMessage;
        }
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Denunciar {tipo === 'anuncio' ? 'Anúncio' : 'Perfil'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecione o motivo da denúncia
            </label>
            <div className="space-y-2.5">
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    motivo === reason
                      ? 'border-red-500 bg-red-50/50 text-red-950 font-medium'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={reason}
                    checked={motivo === reason}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm">{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
              Informações adicionais (opcional)
            </label>
            <textarea
              id="descricao"
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva detalhadamente o ocorrido para nos ajudar a analisar o caso..."
              maxLength={2000}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-gray-400">
                {descricao.length}/2000 caracteres
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Enviando...
                </>
              ) : (
                'Enviar Denúncia'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
