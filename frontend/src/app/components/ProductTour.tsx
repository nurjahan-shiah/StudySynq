'use client';

import { useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface TourStep {
  element: string;
  popover: {
    title: string;
    description: string;
    side?: 'left' | 'right' | 'top' | 'bottom';
    align?: 'start' | 'center' | 'end';
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="dashboard"]',
    popover: {
      title: '📊 Dashboard',
      description: 'Your overview of study groups, sessions, and recommendations. Get quick stats at a glance.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="groups"]',
    popover: {
      title: '👥 Study Groups',
      description: 'Browse, create, or join study groups. Find compatible classmates by course and major.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="courses"]',
    popover: {
      title: '📚 Courses',
      description: 'Manage all your York courses. Link courses to study groups and see classmates.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="sessions"]',
    popover: {
      title: '📅 Sessions',
      description: 'Schedule and join study sessions. Calendar view with all upcoming group meetings.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="resources"]',
    popover: {
      title: '📖 Resources',
      description: 'Share and access study materials, notes, and links with your groups.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="recommendations"]',
    popover: {
      title: '✨ Recommended Groups',
      description: 'AI-powered group recommendations based on your major, courses, and interests.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="tasks"]',
    popover: {
      title: '✓ My Tasks',
      description: 'Track collaborative tasks and assignments across your study groups.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="social"]',
    popover: {
      title: '💬 Social Feed',
      description: 'Post updates, ask questions, and interact with your study community.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="notifications"]',
    popover: {
      title: '🔔 Notifications',
      description: 'Stay updated on group invites, session reminders, and friend requests.',
      side: 'right',
      align: 'end',
    },
  },
  {
    element: '[data-tour="ai-tutor"]',
    popover: {
      title: '🤖 AI Study Assistant',
      description: 'Get instant help with study plans, explanations, and learning strategies.',
      side: 'right',
      align: 'end',
    },
  },
  {
    element: '[data-tour="friends"]',
    popover: {
      title: '👨‍🤝‍👨 Friends',
      description: 'Manage your friends list and see who you can study with.',
      side: 'right',
      align: 'end',
    },
  },
];

let driverInstance: ReturnType<typeof driver> | null = null;
let stylesInjected = false;

function injectTourStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  if (document.getElementById('studysynq-tour-styles')) {
    stylesInjected = true;
    return;
  }
  const styleSheet = document.createElement('style');
  styleSheet.id = 'studysynq-tour-styles';
  styleSheet.innerHTML = tourStyles;
  document.head.appendChild(styleSheet);
  stylesInjected = true;
}

export function ProductTour() {
  const [tourStarted, setTourStarted] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize tour on component mount (client-only — avoids SSR/hydration mismatch)
  useEffect(() => {
    injectTourStyles();
    setMounted(true);

  }, []);

  const startTour = () => {
    setTourStarted(true);

    driverInstance = driver({
      showProgress: true,
      allowClose: true,
      onDestroyed: () => {
        setTourStarted(false);
      },
      popoverClass: 'driver-popover-custom',
      steps: TOUR_STEPS.map((step) => ({
        element: step.element,
        popover: {
          title: step.popover.title,
          description: step.popover.description,
          side: step.popover.side || 'right',
          align: step.popover.align || 'center',
          showButtons: ['next', 'previous', 'close'],
          onNextClick: () => {
            driverInstance?.moveNext();
          },
          onPrevClick: () => {
            driverInstance?.movePrevious();
          },
          onCloseClick: () => {
            driverInstance?.destroy();
            setTourStarted(false);
            localStorage.setItem('studysynq_tour_dismissed', 'true');
          },
        },
      })),
    });

    driverInstance.drive();
  };

  const skipTour = () => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    setTourStarted(false);
    localStorage.setItem('studysynq_tour_dismissed', 'true');
  };

  // Guard against SSR/hydration mismatch — render nothing until client has mounted
  if (!mounted) {
    return null;
  }

  // While the tour is running, show a floating Skip button
  if (tourStarted) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
        }}
      >
        <button
          onClick={skipTour}
          style={{
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 500,
            backgroundColor: 'var(--ss-red)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--ss-red)';
          }}
        >
          ✕ Skip tour
        </button>
      </div>
    );
  }

  // Default: always show the Start tour button in the sidebar
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}
    >
      <button
        onClick={startTour}
        style={{
          flex: 1,
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 500,
          backgroundColor: 'var(--ss-red)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#dc2626';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--ss-red)';
        }}
      >
        ▶ Start tour
      </button>
    </div>
  );
}

// Custom CSS for tour styling
const tourStyles = `
  .driver-popover-custom {
    background: var(--bg2) !important;
    color: var(--text) !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25) !important;
    border: 1px solid var(--border) !important;
  }

  .driver-popover-custom .driver-popover-title {
    font-size: 16px !important;
    font-weight: 600 !important;
    color: var(--text) !important;
    margin-bottom: 8px !important;
  }

  .driver-popover-custom .driver-popover-description {
    font-size: 13px !important;
    color: var(--text2) !important;
    line-height: 1.5 !important;
    margin-bottom: 12px !important;
  }

  .driver-popover-custom .driver-popover-footer {
    display: flex !important;
    gap: 8px !important;
    margin-top: 12px !important;
  }

  .driver-popover-custom button {
    padding: 6px 12px !important;
    font-size: 12px !important;
    border-radius: 5px !important;
    border: 1px solid var(--border) !important;
    background: var(--bg3) !important;
    color: var(--text) !important;
    cursor: pointer !important;
    transition: all 0.2s !important;
  }

  .driver-popover-custom button:hover {
    background: var(--ss-blue) !important;
    color: white !important;
    border-color: var(--ss-blue) !important;
  }

  .driver-popover-custom .driver-popover-progress {
    font-size: 11px !important;
    color: var(--text2) !important;
  }

  /* Highlight the current element */
  .driver-highlighted {
    z-index: 10000 !important;
  }

  .driver-stage {
    border-radius: 8px !important;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3) !important;
  }
`;

export default ProductTour;