import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            <div>
              <CardTitle className="text-2xl font-headline">Team Management</CardTitle>
              <CardDescription>Manage team members and their roles.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This page is a placeholder for team management features.</p>
           <p className="text-muted-foreground mt-2">Future features could include inviting new members, assigning roles (admin, editor, viewer), and managing permissions.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Team Members</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Placeholder for a list of team members.</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Roles &amp; Permissions</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Placeholder for managing roles and permissions.</p></CardContent>
      </Card>
    </div>
  );
}
