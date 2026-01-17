/**
 * Platform Indicator Component
 *
 * Displays the current runtime platform (Desktop vs Web) and available capabilities.
 * Shows a subtle indicator that can be expanded to see detailed feature information.
 */

'use client';

import { useState, useEffect } from 'react';
import { Monitor, Globe, ChevronDown, ChevronUp, Cpu, HardDrive, Usb, Wifi } from 'lucide-react';
import { getPlatformInfo, getPlatformCapabilities, isElectron } from '@/lib/platform';

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

  const isDesktop = isElectron();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg overflow-hidden">
        {/* Collapsed Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-gray-800/50 transition-colors"
        >
          {isDesktop ? (
            <Monitor className="w-4 h-4 text-blue-400" />
          ) : (
            <Globe className="w-4 h-4 text-green-400" />
          )}
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
                tooltip={
                  capabilities.nativeFileSystem
                    ? 'Native filesystem access'
                    : 'Browser virtual filesystem'
                }
              />
              <CapabilityBadge
                icon={<Cpu className="w-3 h-3" />}
                label={capabilities.nativeAssemblyScript ? 'Native ASC' : 'Browser ASC'}
                enabled={capabilities.assemblyScript}
                tooltip={
                  capabilities.nativeAssemblyScript
                    ? 'Native AssemblyScript compiler (faster)'
                    : 'Browser-based AssemblyScript (CDN)'
                }
              />
              <CapabilityBadge
                icon={<Usb className="w-3 h-3" />}
                label="Serial Ports"
                enabled={capabilities.serialPorts}
                tooltip={
                  capabilities.fullSerialPorts
                    ? 'Full serial port access'
                    : capabilities.serialPorts
                    ? 'Web Serial API (limited)'
                    : 'Serial ports not available'
                }
              />
              <CapabilityBadge
                icon={<Wifi className="w-3 h-3" />}
                label="Offline Mode"
                enabled={capabilities.offlineMode}
                tooltip={
                  capabilities.offlineMode
                    ? 'Full offline operation'
                    : 'Requires internet connection'
                }
              />
            </div>

            {/* Features List */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Available Features</h4>
              <ul className="space-y-1">
                {platformInfo.features.map((feature, idx) => (
                  <li key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Desktop App Prompt (only shown in browser mode) */}
            {!isDesktop && (
              <div className="pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-2">
                  Want faster compilation and full hardware access?
                </p>
                <a
                  href="https://github.com/EvolvingAgentsLabs/llmos#desktop-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Download LLMos Desktop →
                </a>
              </div>
            )}
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
 */
export function PlatformBadge() {
  const [platformInfo, setPlatformInfo] = useState<ReturnType<typeof getPlatformInfo> | null>(null);

  useEffect(() => {
    setPlatformInfo(getPlatformInfo());
  }, []);

  if (!platformInfo) return null;

  const isDesktop = isElectron();

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium
        ${
          isDesktop
            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            : 'bg-green-500/10 text-green-400 border border-green-500/20'
        }
      `}
      title={platformInfo.displayName}
    >
      {isDesktop ? (
        <Monitor className="w-3 h-3" />
      ) : (
        <Globe className="w-3 h-3" />
      )}
      <span>{platformInfo.type === 'electron' ? 'Desktop' : 'Web'}</span>
    </div>
  );
}
