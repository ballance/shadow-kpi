import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            We sent you a sign-in link. Click it within 24 hours to sign in.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
