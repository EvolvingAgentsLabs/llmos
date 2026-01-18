/**
 * Platform Indicator Component - Desktop-Only (Phase 1)
 *
 * Displays LLMos Desktop status and available capabilities.
 * Shows a subtle indicator that can be expanded to see detailed feature information.
 *
 * Simplified for desktop-only builds. For Phase 2 browser support,
 * restore web vs desktop detection from git history.
 */

'use client';

import { useState, useEffect } from 'react';
import { Monitor, ChevronDown, ChevronUp, Cpu, HardDrive, Usb, Wifi } from 'lucide-react';
import { getPlatformInfo, getPlatformCapabilities } from '@/lib/platform';

export function PlatformIndicator() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<ReturnType<typeof getPlatformInfo> | null>(null);
  const [capabilities, setCapabilities] = useState<ReturnType<typeof getPlatformCapabilities> | null>(null);

  useEffect(() => {
    setPlatformInfo(getPlatformInfo());
    setCapabilities(getPlatformCapabilities());
  }, []);

  if (!platformInfo || !capabilities) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg overflow-hidden">
        {/* Collapsed Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-gray-800/50 transition-colors"
        >
          <Monitor className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-100">
            {platformInfo.displayName}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            v{platformInfo.version}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400 ml-2" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
          )}
        </button>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-700 p-4 space-y-4">
            {/* Capabilities Grid */}
            <div className="grid grid-cols-2 gap-2">
              <CapabilityBadge
                icon={<HardDrive className="w-3 h-3" />}
                label="File System"
                enabled={capabilities.nativeFileSystem}
                tooltip="Native filesystem access"
              />
              <CapabilityBadge
                icon={<Cpu className="w-3 h-3" />}
                label="Native ASC"
                enabled={capabilities.assemblyScript}
                tooltip="Native AssemblyScript compiler (faster)"
              />
              <CapabilityBadge
                icon={<Usb className="w-3 h-3" />}
                label="Serial Ports"
                enabled={capabilities.serialPorts}
                tooltip="Full serial port access"
              />
              <CapabilityBadge
                icon={<Wifi className="w-3 h-3" />}
                label="Offline Mode"
                enabled={capabilities.offlineMode}
                tooltip="Full offline operation"
              />
            </div>

            {/* Features List */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Desktop Features</h4>
              <ul className="space-y-1">
                {platformInfo.features.map((feature, idx) => (
                  <li key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CapabilityBadgeProps {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  tooltip: string;
}

function CapabilityBadge({ icon, label, enabled, tooltip }: CapabilityBadgeProps) {
  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-1.5 rounded
        ${
          enabled
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-gray-800/50 text-gray-500 border border-gray-700'
        }
      `}
      title={tooltip}
    >
      <span className={enabled ? 'text-green-400' : 'text-gray-500'}>{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

/**
 * Compact Platform Badge (for use in headers/toolbars)
 * Desktop-only version
 */
export function PlatformBadge() {
  const [platformInfo, setPlatformInfo] = useState<ReturnType<typeof getPlatformInfo> | null>(null);

  useEffect(() => {
    setPlatformInfo(getPlatformInfo());
  }, []);

  if (!platformInfo) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
      title={platformInfo.displayName}
    >
      <Monitor className="w-3 h-3" />
      <span>Desktop</span>
    </div>
  );
}
