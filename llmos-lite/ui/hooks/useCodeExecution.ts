'use client';

/**
 * useCodeExecution - Custom hook for code execution state
 *
 * Manages code execution state and status
 */

import { useState, useCallback } from 'react';

interface UseCodeExecutionReturn {
  isExecuting: boolean;
  status: string;
  startExecution: (status?: string) => void;
  updateStatus: (status: string) => void;
  endExecution: () => void;
}

export function useCodeExecution(): UseCodeExecutionReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState('');

  const startExecution = useCallback((initialStatus = 'Executing...') => {
    setIsExecuting(true);
    setStatus(initialStatus);
  }, []);

  const updateStatus = useCallback((newStatus: string) => {
    setStatus(newStatus);
  }, []);

  const endExecution = useCallback(() => {
    setIsExecuting(false);
    setStatus('');
  }, []);

  return {
    isExecuting,
    status,
    startExecution,
    updateStatus,
    endExecution,
  };
}

export default useCodeExecution;
