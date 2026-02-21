import { useToast as useToastHook } from '@/shared/hooks/use-toast';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ShowToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
}

/**
 * Custom hook for showing toast notifications in settings pages
 * Provides a simpler API than the base toast hook
 */
export const useSettingsToast = () => {
  const { toast } = useToastHook();

  const showToast = ({ title, message, type = 'info', duration = 5000 }: ShowToastOptions) => {
    const variantMap: Record<ToastType, 'default' | 'destructive'> = {
      success: 'default',
      error: 'destructive',
      warning: 'default',
      info: 'default',
    };

    toast({
      title,
      description: message,
      variant: variantMap[type],
      duration,
    });
  };

  const success = (title: string, message?: string) => {
    showToast({ title, message, type: 'success' });
  };

  const error = (title: string, message?: string) => {
    showToast({ title, message, type: 'error' });
  };

  const warning = (title: string, message?: string) => {
    showToast({ title, message, type: 'warning' });
  };

  const info = (title: string, message?: string) => {
    showToast({ title, message, type: 'info' });
  };

  return {
    showToast,
    success,
    error,
    warning,
    info,
  };
};

export default useSettingsToast;
