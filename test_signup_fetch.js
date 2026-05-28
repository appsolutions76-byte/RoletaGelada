const SUPABASE_URL = 'https://vjupsdakdxexxcdkqfzf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdXBzZGFrZHhleHhjZGtxZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY2NDYsImV4cCI6MjA5NTI0MjY0Nn0.5XKPuhn34s-EUf6NXqNwpZysQoJVsyBIHQeVg4wnyyo';

async function testSignup() {
    console.log("Testing Signup with fetch...");
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: 'test_real_444@gmail.com',
            password: 'password123',
            data: { bar_name: 'Boteco Teste 444' }
        })
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
}

testSignup();
