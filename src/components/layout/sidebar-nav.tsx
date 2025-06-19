
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListChecks,
  Target,
  PlugZap,
  Database,
  FileText,
  PlayCircle,
  Lightbulb,
  PanelLeftClose, 
  PanelRightOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Logo } from './logo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/schema-definition', label: 'Schema Definition', icon: ListChecks },
  { href: '/evaluation-parameters', label: 'Evaluation Parameters', icon: Target },
  { href: '/model-connectors', label: 'Model Connectors', icon: PlugZap },
  { href: '/datasets', label: 'Datasets', icon: Database },
  { href: '/prompts', label: 'Prompts', icon: FileText },
  { href: '/runs', label: 'Eval Runs', icon: PlayCircle },
  { href: '/insights', label: 'AI Insights', icon: Lightbulb },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className={`transition-all duration-200 ${isCollapsed ? 'px-1' : 'px-0'}`}>
        <Logo collapsed={isCollapsed} />
      </div>
      <Separator className="my-2" />
      <SidebarMenu className="flex-1 px-2">
        {navItems.map((item) => (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href} legacyBehavior passHref>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                tooltip={isCollapsed ? item.label : undefined}
                className="justify-start"
                onClick={handleLinkClick}
              >
                <a>
                  <item.icon className="h-5 w-5" />
                  {!isCollapsed && <span>{item.label}</span>}
                </a>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      
      {!isMobile && (
        <div className={cn(
          "mt-auto border-t border-sidebar-border flex",
          isCollapsed ? "justify-center" : "justify-end",
          "p-2" 
        )}>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="h-8 w-8"
                >
                  {isCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                <p>{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
