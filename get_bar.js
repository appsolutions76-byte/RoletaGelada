const url = 'https://vjupsdakdxexxcdkqfzf.supabase.co/rest/v1/bars';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdXBzZGFrZHhleHhjZGtxZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY2NDYsImV4cCI6MjA5NTI0MjY0Nn0.5XKPuhn34s-EUf6NXqNwpZysQoJVsyBIHQeVg4wnyyo';

fetch(url, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
})
.then(res => res.json())
.then(data => {
    console.log(JSON.stringify(data, null, 2));
})
.catch(err => console.error(err));
