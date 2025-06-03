
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-4 md:p-0">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-xl md:text-2xl font-headline">Settings</CardTitle>
              <CardDescription>Manage your application settings and preferences.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This page is a placeholder for application settings.</p>
          <p className="text-muted-foreground mt-2">Future settings could include user profile management, notification preferences, API key management (if centralized), theme preferences, etc.</p>
        </CardContent>
      </Card>
       <Card>
        <CardHeader><CardTitle>User Profile</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Placeholder for user profile settings.</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Placeholder for notification preferences.</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Theme</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Placeholder for theme selection (Light/Dark/System).</p></CardContent>
      </Card>
    </div>
  );
}
