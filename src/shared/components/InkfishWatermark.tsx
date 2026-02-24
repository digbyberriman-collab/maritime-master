/**
 * InkfishWatermark Component
 * 
 * IMPORTANT: This watermark MUST appear on ALL pages in STORM platform.
 * 
 * When creating new pages:
 * 1. Ensure page uses DashboardLayout wrapper (includes watermark automatically)
 * 2. If creating standalone page, manually import and add <InkfishWatermark />
 * 3. Verify watermark visible after page creation
 * 4. Test z-index - watermark should be behind all interactive content
 * 
 * Watermark specifications:
 * - Opacity: 0.03-0.05 (very subtle)
 * - Position: Fixed, centered
 * - Z-index: 0 (behind content)
 * - Non-interactive (pointer-events: none)
 * 
 * DO NOT REMOVE OR HIDE THIS WATERMARK
 */
import React, { useState } from 'react';

export const InkfishWatermark: React.FC = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      data-watermark="inkfish"
      className="fixed inset-0 z-[1] flex items-center justify-center pointer-events-none select-none"
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <div className="relative w-[70%] sm:w-[60%] lg:w-[50%] max-w-[600px] aspect-square flex items-center justify-center translate-y-[5%]">
        {!imageError ? (
          <img
            src="/assets/inkfish-logo.png"
            alt=""
            fetchPriority="high"
            className="w-full h-full object-contain opacity-[0.04] grayscale"
            onError={() => setImageError(true)}
            draggable={false}
          />
        ) : (
          <div className="text-[8rem] sm:text-[10rem] lg:text-[12rem] font-bold text-muted-foreground/5 whitespace-nowrap">
            Powered by Inkfish
          </div>
        )}
      </div>
    </div>
  );
};

export default InkfishWatermark;
