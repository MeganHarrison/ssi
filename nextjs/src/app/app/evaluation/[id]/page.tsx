"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Send,
  Loader2,
  Edit2,
  Save,
  X,
  MessageSquare,
} from 'lucide-react';
import { createSPASassClient } from '@/lib/supabase/client';
import { INITIAL_GREETING } from '@/lib/ai/prompts';
import { formatEvaluationDate, mergeManualEvaluationEdits } from '@/lib/evaluation-form-data.mjs';
import type { Json } from '@/lib/types';

interface Evaluation {
  id: string;
  status: string;
  client_name: string | null;
  client_dob: string | null;
  examiner_name: string | null;
  test_date: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form_data: any;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function EvaluationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const evaluationId = params.id as string;

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([
    { id: 'greeting', role: 'assistant', content: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchEvaluation() {
      try {
        const client = await createSPASassClient();
        const supabase = client.getSupabaseClient();

        const { data, error } = await supabase
          .from('evaluations')
          .select('*')
          .eq('id', evaluationId)
          .single();

        if (error) {
          console.error('Error fetching evaluation:', error);
          router.push('/app/evaluation');
          return;
        }

        const { data: chatRows, error: chatError } = await supabase
          .from('chat_messages')
          .select('id, role, content')
          .eq('evaluation_id', evaluationId)
          .order('created_at', { ascending: true });
        if (chatError) throw new Error(`Could not load saved conversation: ${chatError.message}`);

        setEvaluation(data);
        setMessages([
          { id: 'greeting', role: 'assistant', content: INITIAL_GREETING },
          ...(chatRows ?? []).map((row) => ({ id: row.id, role: row.role as Message['role'], content: row.content })),
        ]);
        setShowChat(data.status === 'in_progress' || (chatRows?.length ?? 0) > 0);
        setEditedData({
          client_name: data.client_name || '',
          client_dob: data.client_dob || '',
          examiner_name: data.examiner_name || '',
          test_date: data.test_date || '',
        });
      } catch (error) {
        console.error('Error:', error);
        setChatError(error instanceof Error ? error.message : 'Could not load this evaluation.');
      } finally {
        setLoading(false);
      }
    }

    fetchEvaluation();
  }, [evaluationId, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || !evaluationId) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setChatError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId,
          messageId: userMessage.id,
          message: content,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Chat request failed (${response.status})`);
      }

      setInput('');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      const assistantId = response.headers.get('X-Assistant-Message-Id');
      if (!assistantId) throw new Error('The assistant response was not saved. Your message is preserved; retry to continue.');
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: assistantMessage } : m
          )
        );
      }
      const client = await createSPASassClient();
      const supabase = client.getSupabaseClient();
      const { data: savedAssistant, error: savedAssistantError } = await supabase
        .from('chat_messages').select('id').eq('id', assistantId).eq('evaluation_id', evaluationId).maybeSingle();
      if (savedAssistantError || !savedAssistant) throw new Error('The assistant response could not be confirmed as saved. Refresh before continuing.');
    } catch (error) {
      console.error('Error sending message:', error);
      setChatError(error instanceof Error ? error.message : 'Could not save or send this message.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSave = async () => {
    if (!evaluation) return;

    try {
      const client = await createSPASassClient();
      const supabase = client.getSupabaseClient();
      const formData = mergeManualEvaluationEdits(evaluation.form_data, editedData);

      const { error } = await supabase
        .from('evaluations')
        .update({
          client_name: editedData.client_name || null,
          client_dob: editedData.client_dob || null,
          examiner_name: editedData.examiner_name || null,
          test_date: editedData.test_date || null,
          form_data: formData as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', evaluationId);

      if (error) {
        console.error('Error saving:', error);
        alert('Failed to save changes');
        return;
      }

      setEvaluation({
        ...evaluation,
        ...editedData,
        form_data: formData,
        updated_at: new Date().toISOString(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OWLS-II-${evaluation?.client_name || 'Evaluation'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to generate PDF');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error generating PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    return formatEvaluationDate(dateString, 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="text-center py-12">
        <p role={chatError ? 'alert' : undefined} className={chatError ? 'text-red-700' : 'text-gray-600'}>
          {chatError || 'Evaluation not found'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/app/evaluation')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Evaluations
        </button>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowChat(!showChat)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <MessageSquare className="h-5 w-5 mr-2" />
            {showChat ? 'Hide Chat' : 'Add Info'}
          </button>
          <button
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Download className="h-5 w-5 mr-2" />
            )}
            Download PDF
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evaluation Details Card */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Evaluation Details</h2>
            {isEditing ? (
              <div className="flex space-x-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  onClick={handleSave}
                  className="p-2 text-green-600 hover:text-green-700"
                >
                  <Save className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <Edit2 className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Client Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.client_name}
                  onChange={(e) => setEditedData({ ...editedData, client_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{evaluation.client_name || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Date of Birth
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={editedData.client_dob}
                  onChange={(e) => setEditedData({ ...editedData, client_dob: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{formatDate(evaluation.client_dob)}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Examiner
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.examiner_name}
                  onChange={(e) => setEditedData({ ...editedData, examiner_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{evaluation.examiner_name || 'Not set'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Test Date
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={editedData.test_date}
                  onChange={(e) => setEditedData({ ...editedData, test_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{formatDate(evaluation.test_date)}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Status
              </label>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  evaluation.status === 'complete'
                    ? 'bg-green-100 text-green-800'
                    : evaluation.status === 'in_progress'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {evaluation.status}
              </span>
            </div>

            <div className="pt-4 border-t text-sm text-gray-500">
              <p>Created: {formatDate(evaluation.created_at)}</p>
              <p>Last updated: {formatDate(evaluation.updated_at)}</p>
            </div>
          </div>
        </div>

        {/* Form Data Preview */}
        {evaluation.form_data && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Extracted Data</h2>
            <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(evaluation.form_data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Chat Interface */}
      {showChat && (
        <div className="mt-6 bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-medium text-gray-900">Add More Information</h3>
            <p className="text-sm text-gray-600">Chat with the AI to add missing details</p>
          </div>

          <div className="h-80 overflow-y-auto p-4 space-y-4">
            {chatError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{chatError}</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-3">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex space-x-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type additional information..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
