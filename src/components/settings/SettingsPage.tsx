import React from 'react';
import { useSettings } from '@/lib/hooks/useSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import SectionToggles from './SectionToggles';
import ThemeSelector from './ThemeSelector';
import BehaviorSettings from './BehaviorSettings';
import DataSettings from './DataSettings';

export default function SettingsPage() {
  const { settings, update, loading } = useSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  const brandUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/app/logo.png')
      : null;

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {brandUrl && (
          <img
            src={brandUrl}
            alt="BuzzRatings"
            className="w-12 h-12 rounded-full"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            BuzzRatings
          </h1>
          <p className="text-sm text-muted-foreground">
            Customize your experience
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Appearance
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ThemeSelector settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Sections */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sections
            </p>
          </CardHeader>
          <CardContent>
            <SectionToggles settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Behavior */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Behavior
            </p>
          </CardHeader>
          <CardContent>
            <BehaviorSettings settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Data */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Data & Cache
            </p>
          </CardHeader>
          <CardContent>
            <DataSettings settings={settings} onUpdate={update} />
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-muted-foreground">
        <p>BuzzRatings v1.0 — Made for Georgia Tech</p>
        <a
          href="mailto:ikuria@ucsc.edu?subject=BuzzRatings Feedback"
          className="text-ucsc-blue hover:underline mt-1 inline-block"
        >
          Send feedback
        </a>
      </div>
    </div>
  );
}
