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
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
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
    };
    reader.readAsText(file);
  };

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      const assistantId = (Date.now() + 1).toString();
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
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit transcript and start chat
  const handleTranscriptSubmit = async () => {
    if (!transcript.trim()) return;

    // Create evaluation in database
    const id = await createEvaluation();
    if (id) {
      setEvaluationId(id);
    }

    setCurrentStep('chat');

    // Send transcript as first message
    await sendMessage(`Here is my evaluation transcript:\n\n${transcript}`);
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
          messages: messages.map(m => ({ role: m.role, content: m.content })),
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
              disabled={!transcript.trim()}
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
