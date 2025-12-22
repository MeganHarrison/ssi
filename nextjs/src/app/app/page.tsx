"use client";
import React from 'react';
import { useGlobal } from '@/lib/context/GlobalContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { CalendarDays, Settings, FileText, Plus, Mic } from 'lucide-react';
import Link from 'next/link';

export default function DashboardContent() {
    const { loading, user } = useGlobal();

    const getDaysSinceRegistration = () => {
        if (!user?.registered_at) return 0;
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - user.registered_at.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    const daysSinceRegistration = getDaysSinceRegistration();

    return (
        <div className="space-y-6 p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Welcome, {user?.email?.split('@')[0]}! 👋</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Member for {daysSinceRegistration} days
                    </CardDescription>
                </CardHeader>
            </Card>

            {/* New Evaluation - Primary Action */}
            <Card className="border-primary-200 bg-primary-50/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mic className="h-5 w-5 text-primary-600" />
                        Create Evaluation from Voice Memo
                    </CardTitle>
                    <CardDescription>
                        Upload your voice memo transcript and let the AI help fill out the OWLS II form
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link
                        href="/app/evaluation/new"
                        className="inline-flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                    >
                        <Plus className="h-5 w-5 mr-2" />
                        Start New Evaluation
                    </Link>
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Frequently used features</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Link
                            href="/app/evaluation"
                            className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="p-2 bg-primary-50 rounded-full">
                                <FileText className="h-4 w-4 text-primary-600" />
                            </div>
                            <div>
                                <h3 className="font-medium">View Evaluations</h3>
                                <p className="text-sm text-gray-500">See all your OWLS II evaluation reports</p>
                            </div>
                        </Link>

                        <Link
                            href="/app/user-settings"
                            className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="p-2 bg-primary-50 rounded-full">
                                <Settings className="h-4 w-4 text-primary-600" />
                            </div>
                            <div>
                                <h3 className="font-medium">User Settings</h3>
                                <p className="text-sm text-gray-500">Manage your account preferences</p>
                            </div>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* How It Works */}
            <Card>
                <CardHeader>
                    <CardTitle>How It Works</CardTitle>
                    <CardDescription>Complete evaluations in 4 easy steps</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="text-center p-4">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-primary-600 font-semibold">1</span>
                            </div>
                            <h4 className="font-medium text-sm">Record</h4>
                            <p className="text-xs text-gray-500 mt-1">Use Voice Memos on your phone</p>
                        </div>
                        <div className="text-center p-4">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-primary-600 font-semibold">2</span>
                            </div>
                            <h4 className="font-medium text-sm">Upload</h4>
                            <p className="text-xs text-gray-500 mt-1">Paste or upload your transcript</p>
                        </div>
                        <div className="text-center p-4">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-primary-600 font-semibold">3</span>
                            </div>
                            <h4 className="font-medium text-sm">Chat</h4>
                            <p className="text-xs text-gray-500 mt-1">AI asks for any missing info</p>
                        </div>
                        <div className="text-center p-4">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-primary-600 font-semibold">4</span>
                            </div>
                            <h4 className="font-medium text-sm">Download</h4>
                            <p className="text-xs text-gray-500 mt-1">Get your completed PDF form</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}