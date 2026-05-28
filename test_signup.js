const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vjupsdakdxexxcdkqfzf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdXBzZGFrZHhleHhjZGtxZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY2NDYsImV4cCI6MjA5NTI0MjY0Nn0.5XKPuhn34s-EUf6NXqNwpZysQoJVsyBIHQeVg4wnyyo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSignup() {
    console.log("Testing Master Signup...");
    const { data: data1, error: err1 } = await supabase.auth.signUp({
        email: 'appsolutions76@gmail.com',
        password: 'password123'
    });
    console.log("Master Error:", err1);

    console.log("Testing Partner Signup...");
    const { data: data2, error: err2 } = await supabase.auth.signUp({
        email: 'fredsonfsb45@gmail.com',
        password: 'password123',
        options: { data: { bar_name: 'Boteco do Nando' } }
    });
    console.log("Partner Error:", err2);
}

testSignup();
