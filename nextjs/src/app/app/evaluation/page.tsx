"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { createSPASassClient } from '@/lib/supabase/client';
import { formatEvaluationDate } from '@/lib/evaluation-form-data.mjs';

interface Evaluation {
  id: string;
  client_name: string | null;
  status: string;
  test_date: string | null;
  created_at: string;
  updated_at: string;
}

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvaluations() {
      try {
        const client = await createSPASassClient();
        const supabase = client.getSupabaseClient();

        const { data, error } = await supabase
          .from('evaluations')
          .select('id, client_name, status, test_date, created_at, updated_at')
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('Error fetching evaluations:', error);
          // Table might not exist yet - that's okay
          setEvaluations([]);
        } else {
          setEvaluations(data || []);
        }
      } catch (error) {
        console.error('Error:', error);
        setEvaluations([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEvaluations();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'complete':
        return 'Complete';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Draft';
    }
  };

  const formatDate = (dateString: string) => {
    return formatEvaluationDate(dateString, 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluations</h1>
          <p className="mt-1 text-gray-600">
            Manage your OWLS II evaluation reports
          </p>
        </div>
        <Link
          href="/app/evaluation/new"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Evaluation
        </Link>
      </div>

      {/* Evaluations List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading evaluations...</p>
        </div>
      ) : evaluations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
          <FileText className="h-12 w-12 text-gray-400 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No evaluations yet</h3>
          <p className="mt-2 text-gray-600">
            Get started by creating your first evaluation
          </p>
          <Link
            href="/app/evaluation/new"
            className="mt-6 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Evaluation
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {evaluations.map((evaluation) => (
              <li key={evaluation.id}>
                <Link
                  href={`/app/evaluation/${evaluation.id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(evaluation.status)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {evaluation.client_name || 'Unnamed Client'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {evaluation.test_date
                              ? `Test date: ${formatDate(evaluation.test_date)}`
                              : 'No test date set'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            evaluation.status === 'complete'
                              ? 'bg-green-100 text-green-800'
                              : evaluation.status === 'in_progress'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {getStatusLabel(evaluation.status)}
                        </span>
                        <p className="mt-1 text-xs text-gray-500">
                          Updated {formatDate(evaluation.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-900">How it works</h3>
        <ol className="mt-2 text-sm text-blue-800 list-decimal list-inside space-y-1">
          <li>Paste or upload your voice memo transcript</li>
          <li>Chat with the AI assistant to fill in any missing details</li>
          <li>Review the extracted information</li>
          <li>Download the completed OWLS II PDF form</li>
        </ol>
      </div>
    </div>
  );
}
