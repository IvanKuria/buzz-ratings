import React, { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/hooks/useSettings';
import { stagger, professorSwitch } from '@/lib/animations';
import { getFirst } from '@/lib/format';
import { useProfessorPhoto } from '@/lib/hooks/useProfessorPhoto';
import ProfessorHeader from '@/components/professor/ProfessorHeader';
import RatingSummary from '@/components/professor/RatingSummary';
import RatingTags from '@/components/professor/RatingTags';
import ReviewCarousel from '@/components/professor/ReviewCarousel';
import { Settings } from 'lucide-react';
import type { ProfessorData, SettingsSections } from '@/types';

const GradeDistribution = lazy(() => import('@/components/GradeDistribution'));

/**
 * Main professor panel component for the side panel.
 * Orchestrates all decomposed professor sub-components,
 * respects user settings for section visibility, and
 * provides animated professor transitions.
 */
export default function ProfessorPanel({
  apiData,
  rateMyProfessor,
  reviews,
  localResearchTopic,
  localClassesTaught,
  instructorName,
  instructorEmail,
  course,
}: ProfessorData) {
  const { settings, loading: settingsLoading } = useSettings();

  // Best-effort headshot from departmental faculty pages (null -> initials).
  const photoSrc = useProfessorPhoto(
    instructorName,
    instructorEmail,
    rateMyProfessor?.department ?? null
  );

  if (!apiData && !rateMyProfessor) return null;

  // Derive display data from raw API/LDAP fields

  const name = getFirst(apiData?.cn) || instructorName || 'Unknown Professor';
  const division = getFirst(apiData?.ucscpersonpubdivision);

  // RMP data
  const rmpNode = rateMyProfessor;
  const department =
    getFirst(apiData?.ucscpersonpubdepartmentnumber) ||
    rmpNode?.department ||
    null;
  const overallRating = rmpNode?.avgRatingRounded ?? null;
  const difficulty = rmpNode?.avgDifficultyRounded ?? null;
  // RMP returns -1 for unknown would-take-again; treat any negative as no data.
  const rawTakeAgain =
    rmpNode?.wouldTakeAgainPercentRounded ??
    rmpNode?.wouldTakeAgainPercent ??
    null;
  const takeAgainPercent =
    typeof rawTakeAgain === 'number' && rawTakeAgain >= 0 ? rawTakeAgain : null;
  const numRatings = rmpNode?.numRatings ?? 0;
  const ratingTags = Array.isArray(rmpNode?.teacherRatingTags)
    ? rmpNode!.teacherRatingTags.filter((t) => t?.tagName)
    : [];
  const topTags = ratingTags.slice(0, 5);
  const legacyId = rmpNode?.legacyId;
  const rmpUrl = legacyId
    ? `https://www.ratemyprofessors.com/professor/${legacyId}`
    : null;

  // Unique professor key for transitions
  const professorKey = rmpNode?.id || `${name}-${department || 'unknown'}`;

  // Section visibility from settings
  const sections: SettingsSections = settingsLoading
    ? {
        rmpRatings: true,
        gradeDistribution: true,
        reviews: true,
        tags: true,
      }
    : settings.sections;

  // Brand logo URL
  const brandLogoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/app/logo.png')
      : null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Frosted glass header */}
      <header
        className={cn(
          'sticky top-0 z-10 flex items-center gap-3 px-4 py-3',
          'border-b bg-background/80 backdrop-blur-xl'
        )}
      >
        {brandLogoUrl && (
          <img src={brandLogoUrl} alt="BuzzRatings" className="size-6" />
        )}
        <h2 className="text-sm font-semibold tracking-tight flex-1">
          BuzzRatings
        </h2>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={professorKey}
            initial={professorSwitch.initial}
            animate={professorSwitch.animate}
            exit={professorSwitch.exit}
            transition={professorSwitch.transition}
          >
            <motion.div
              className="flex flex-col gap-0 p-4"
              variants={stagger.container}
              initial="hidden"
              animate="visible"
            >
              {/* Professor Header - always shown */}
              <motion.div variants={stagger.item} className="mb-3">
                <ProfessorHeader
                  name={name}
                  department={department}
                  division={division}
                  photoSrc={photoSrc}
                />
              </motion.div>

              {/* RMP Ratings section */}
              {sections.rmpRatings && rmpNode && (
                <motion.div variants={stagger.item} className="mb-1">
                  <h4 className="text-sm font-semibold text-foreground px-1 mb-2">
                    Rate My Professor
                  </h4>
                  <RatingSummary
                    overallRating={overallRating}
                    difficulty={difficulty}
                    takeAgainPercent={takeAgainPercent}
                    numRatings={numRatings}
                    rmpUrl={rmpUrl}
                  />
                  <Separator className="my-3" />
                </motion.div>
              )}

              {/* Tags section */}
              {sections.tags && topTags.length > 0 && (
                <motion.div variants={stagger.item} className="mb-1">
                  <h4 className="text-sm font-semibold text-foreground px-1 mb-2">
                    Top Tags
                  </h4>
                  <RatingTags tags={topTags} />
                  <Separator className="my-3" />
                </motion.div>
              )}

              {/* Grade Distribution section */}
              {sections.gradeDistribution && instructorName && (
                <motion.div variants={stagger.item} className="mb-1">
                  <Suspense
                    fallback={
                      <div className="space-y-2 px-1">
                        <Skeleton className="h-4 w-32 rounded-md" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                      </div>
                    }
                  >
                    <GradeDistribution
                      instructorName={instructorName}
                      course={course}
                    />
                  </Suspense>
                  <Separator className="my-3" />
                </motion.div>
              )}

              {/* Reviews section */}
              {sections.reviews &&
                Array.isArray(reviews) &&
                reviews.length > 0 && (
                  <motion.div variants={stagger.item} className="mb-1">
                    <ReviewCarousel reviews={reviews} />
                  </motion.div>
                )}

              {/* Feedback + maker credit */}
              <motion.div
                variants={stagger.item}
                className="flex flex-col items-center gap-1.5 pt-4 pb-6"
              >
                <a
                  href="mailto:ikuria@ucsc.edu?subject=BuzzRatings Feedback"
                  className={cn(
                    'text-xs text-muted-foreground',
                    'hover:text-foreground transition-colors',
                    'underline underline-offset-2'
                  )}
                >
                  Have feedback? Let me know
                </a>
                <a
                  href="https://www.linkedin.com/in/ivan-kuria-46ab68312/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'text-xs text-muted-foreground',
                    'hover:text-foreground transition-colors'
                  )}
                >
                  Made by Ivan Kuria ·{' '}
                  <span className="underline underline-offset-2">LinkedIn</span>
                </a>
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
