"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Upload,
  FileText,
  Loader2,
  ArrowLeft,
  Download,
  RefreshCw,
} from 'lucide-react';
import { createSPASassClient } from '@/lib/supabase/client';
import { INITIAL_GREETING } from '@/lib/ai/prompts';
import { OWLSIIEvaluation, createEmptyEvaluation } from '@/lib/schema/owls-ii';

type Step = 'input' | 'chat' | 'review' | 'download';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function NewEvaluationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [transcript, setTranscript] = useState('');
  const [transcriptSource, setTranscriptSource] = useState<'upload' | 'paste'>('paste');
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [evaluationData] = useState<OWLSIIEvaluation>(createEmptyEvaluation());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'greeting', role: 'assistant', content: INITIAL_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('evaluationId');
    if (!id) return;

    let cancelled = false;
    setIsRestoring(true);
    (async () => {
      try {
        const client = await createSPASassClient();
        const supabase = client.getSupabaseClient();
        const [{ data: evaluation, error: evaluationError }, { data: transcriptRows, error: transcriptError }, { data: chatRows, error: chatError }] = await Promise.all([
          supabase.from('evaluations').select('id').eq('id', id).single(),
          supabase.from('transcripts').select('content').eq('evaluation_id', id).order('created_at', { ascending: true }).limit(1),
          supabase.from('chat_messages').select('id, role, content').eq('evaluation_id', id).order('created_at', { ascending: true }),
        ]);
        if (evaluationError) throw new Error(`Evaluation could not be restored: ${evaluationError.message}`);
        if (transcriptError) throw new Error(`Transcript could not be restored: ${transcriptError.message}`);
        if (chatError) throw new Error(`Conversation could not be restored: ${chatError.message}`);
        if (!evaluation) throw new Error('Evaluation could not be restored. It may have been deleted or access was removed.');
        if (cancelled) return;
        setEvaluationId(id);
        setTranscript(transcriptRows?.[0]?.content ?? '');
        setMessages([
          { id: 'greeting', role: 'assistant', content: INITIAL_GREETING },
          ...(chatRows ?? []).map((row) => ({ id: row.id, role: row.role as Message['role'], content: row.content })),
        ]);
        setCurrentStep('chat');
      } catch (error) {
        if (!cancelled) setChatError(error instanceof Error ? error.message : 'Could not restore this evaluation.');
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Create evaluation in database
  const createEvaluation = async () => {
    try {
      const client = await createSPASassClient();
      const supabase = client.getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        console.error('No user logged in');
        return null;
      }

      const { data, error } = await supabase
        .from('evaluations')
        .insert({
          owner: session.user.id,
          status: 'in_progress',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating evaluation:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setTranscript(text);
      setTranscriptSource('upload');
    };
    reader.readAsText(file);
  };

  // Send message to AI
  const sendMessage = async (content: string, targetEvaluationId = evaluationId) => {
    if (!content.trim() || !targetEvaluationId) return;

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
          evaluationId: targetEvaluationId,
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
        .from('chat_messages').select('id').eq('id', assistantId).eq('evaluation_id', targetEvaluationId).maybeSingle();
      if (savedAssistantError || !savedAssistant) throw new Error('The assistant response could not be confirmed as saved. Refresh before continuing.');
    } catch (error) {
      console.error('Error sending message:', error);
      setChatError(error instanceof Error ? error.message : 'Could not save or send this message.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit transcript and start chat
  const handleTranscriptSubmit = async () => {
    if (!transcript.trim()) return;

    // Create evaluation in database
    setChatError(null);
    const id = await createEvaluation();
    if (!id) {
      setChatError('Could not create the evaluation. Your transcript is still here; retry.');
      return;
    }
    setEvaluationId(id);

    const client = await createSPASassClient();
    const supabase = client.getSupabaseClient();
    const { error } = await supabase.from('transcripts').insert({ evaluation_id: id, content: transcript, source: transcriptSource });
    if (error) {
      const { error: deleteError } = await supabase.from('evaluations').delete().eq('id', id);
      setEvaluationId(null);
      setChatError(deleteError
        ? `Transcript could not be saved (${error.message}); evaluation ${id} also could not be removed (${deleteError.message}). Your transcript remains on this page.`
        : `Transcript could not be saved (${error.message}). The empty evaluation was removed; your transcript remains on this page.`);
      return;
    }

    window.history.replaceState(null, '', `/app/evaluation/new?evaluationId=${encodeURIComponent(id)}`);
    setCurrentStep('chat');

    // Send transcript as first message
    await sendMessage(`Here is my evaluation transcript:\n\n${transcript}`, id);
  };

  // Handle chat form submit
  const onChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Generate PDF
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
        a.download = `OWLS-II-Evaluation-${evaluationData.client?.name || 'Report'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setCurrentStep('download');
      } else {
        console.error('Failed to generate PDF');
        alert('Failed to generate PDF. Please try again.');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const steps = [
    { id: 'input', label: 'Upload Transcript' },
    { id: 'chat', label: 'Fill Details' },
    { id: 'review', label: 'Review' },
    { id: 'download', label: 'Download' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {isRestoring && <p role="status" className="mb-4 text-sm text-gray-600">Restoring saved evaluation…</p>}
      {chatError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{chatError}</p>}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/app/evaluation')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Evaluations
        </button>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  currentStep === step.id
                    ? 'bg-primary-600 text-white'
                    : steps.findIndex(s => s.id === currentStep) > index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`ml-2 text-sm ${
                  currentStep === step.id ? 'text-primary-600 font-medium' : 'text-gray-600'
                }`}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div className="w-12 h-0.5 mx-4 bg-gray-200" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Step 1: Input Transcript */}
        {currentStep === 'input' && (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Upload or Paste Your Transcript
            </h2>
            <p className="text-gray-600 mb-6">
              Paste your voice memo transcript below or upload a text file. The AI assistant will
              help extract the evaluation information.
            </p>

            {/* File Upload */}
            <div className="mb-6">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".txt,.text"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Text File
              </button>
            </div>

            {/* Textarea */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste your transcript here:
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your voice memo transcript or evaluation notes here..."
                rows={12}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleTranscriptSubmit}
              disabled={!transcript.trim() || isLoading}
              className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue to Chat
            </button>
          </div>
        )}

        {/* Step 2: Chat Interface */}
        {(currentStep === 'chat' || currentStep === 'review') && (
          <div className="flex flex-col h-[600px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

            {/* Input Form */}
            <div className="border-t p-4">
              <form id="chat-form" onSubmit={onChatSubmit} className="flex space-x-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your response..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 transition-colors"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>

              {/* Action Buttons */}
              <div className="flex justify-between mt-4">
                <button
                  onClick={() => setCurrentStep('input')}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Start Over
                </button>
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || messages.length < 3}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                >
                  {isGeneratingPdf ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Generate PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Download Complete */}
        {currentStep === 'download' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              PDF Generated Successfully!
            </h2>
            <p className="text-gray-600 mb-6">
              Your OWLS II evaluation form has been downloaded.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleGeneratePdf}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                Download Again
              </button>
              <button
                onClick={() => router.push('/app/evaluation')}
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Back to Evaluations
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
