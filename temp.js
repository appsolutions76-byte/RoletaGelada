
        const SUPABASE_URL = 'https://vjupsdakdxexxcdkqfzf.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdXBzZGFrZHhleHhjZGtxZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY2NDYsImV4cCI6MjA5NTI0MjY0Nn0.5XKPuhn34s-EUf6NXqNwpZysQoJVsyBIHQeVg4wnyyo';
        
        let supabase;
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (initErr) {
            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('prizes-list').innerHTML = `<p class="text-red-500 font-bold">Erro crítico de carregamento: O script do Supabase não foi carregado. Desative o AdBlock ou verifique sua conexão. Detalhe: ${initErr.message}</p>`;
            });
        }

        
        let BAR_ID = new URLSearchParams(window.location.search).get('bar') || '11111111-1111-1111-1111-111111111111';
        let currentPrizeId = null;
        let currentRoundId = null;
        let prizeName = '';

        async function loadPrizes() {
            try {
                const { data: bar, error: barErr } = await supabase.from('bars').select('name').eq('id', BAR_ID).single();
                if (barErr && barErr.code !== 'PGRST116') throw barErr;
                if (bar) document.getElementById('bar-name').innerText = bar.name;

                const { data: prizes, error: prizesErr } = await supabase.from('prizes').select('*').eq('bar_id', BAR_ID).eq('active', true);
                if (prizesErr) throw prizesErr;

                const list = document.getElementById('prizes-list');
                list.innerHTML = '';
                
                if (!prizes || prizes.length === 0) {
                    list.innerHTML = '<p class="text-center text-yellow-400">Nenhum prêmio disponível neste bar.</p>';
                    return;
                }

                prizes.forEach(p => {
                    const div = document.createElement('div');
                    div.className = "flex justify-between items-center p-4 glass rounded-xl cursor-pointer hover:bg-white/10 transition";
                    div.innerHTML = `
                        <div><h3 class="font-bold text-lg">${p.name}</h3><p class="text-sm text-gray-400">Custo do bar: R$ ${p.prize_cost}</p></div>
                        <div class="text-right"><span class="block font-bold text-cyan-400">Aposta: R$ ${p.bet_amount}</span></div>
                    `;
                    div.onclick = () => selectPrize(p);
                    list.appendChild(div);
                });
            } catch (err) {
                document.getElementById('prizes-list').innerHTML = `<p class="text-center text-red-500 font-bold">Erro: ${err.message || JSON.stringify(err)}</p>`;
            }
        }
        
        function selectPrize(p) {
            currentPrizeId = p.id;
            prizeName = p.name;
            document.getElementById('step-catalog').classList.add('hidden');
            document.getElementById('step-pay').classList.remove('hidden');
            document.getElementById('display-bet').innerText = p.bet_amount;
            document.getElementById('display-prize').innerText = p.name;
        }

        document.getElementById('btn-generate-pix').onclick = async () => {
            const btn = document.getElementById('btn-generate-pix');
            btn.disabled = true; btn.innerText = 'Gerando...';
            try {
                const { data, error } = await supabase.functions.invoke('create-pix', { body: { prize_id: currentPrizeId } });
                if (error) throw error;
                currentRoundId = data.round_id;
                document.getElementById('pix-qr').innerHTML = "";
                new QRCode(document.getElementById('pix-qr'), { text: data.qr_code, width: 150, height: 150 });
                btn.classList.add('hidden');
                document.getElementById('pix-container').classList.remove('hidden');

                // Botão Mock para Testes
                if (data.qr_code.startsWith('MOCK')) {
                    const btnMock = document.createElement('button');
                    btnMock.innerText = "Simular Pagamento (Teste)";
                    btnMock.className = "mt-4 bg-green-500 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-lg shadow transition";
                    btnMock.onclick = async () => {
                        btnMock.innerText = "Simulando...";
                        btnMock.disabled = true;
                        await fetch(`${SUPABASE_URL}/functions/v1/mp-webhook?topic=payment&external_reference=${currentRoundId}`, { method: 'POST' });
                    };
                    document.getElementById('pix-container').appendChild(btnMock);
                }
                
                supabase.channel(`round-${currentRoundId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${currentRoundId}` }, payload => {
                    if (payload.new.status === 'paid') {
                        document.getElementById('step-pay').classList.add('hidden');
                        document.getElementById('step-spin').classList.remove('hidden');
                        const spinBtn = document.getElementById('btn-spin');
                        spinBtn.disabled = false;
                        spinBtn.classList.replace('bg-gray-600', 'bg-green-500');
                        drawRoulette();
                    }
                }).subscribe();
            } catch (err) { alert("Erro ao gerar Pix: " + err.message); }
        };

        const canvas = document.getElementById('roulette-canvas');
        const ctx = canvas.getContext('2d');
        function drawRoulette() {
            const segments = [prizeName, "NADA", "GIRE +1", "NADA", prizeName, "NADA"];
            const colors = ["#eab308", "#1e293b", "#3b82f6", "#1e293b", "#eab308", "#1e293b"];
            const arc = Math.PI / (segments.length / 2);
            for(let i = 0; i < segments.length; i++) {
                ctx.beginPath(); ctx.fillStyle = colors[i]; ctx.moveTo(150, 150);
                ctx.arc(150, 150, 150, i * arc, (i + 1) * arc); ctx.fill(); ctx.save();
                ctx.fillStyle = "white"; ctx.font = "bold 14px Inter";
                ctx.translate(150 + Math.cos(i * arc + arc / 2) * 100, 150 + Math.sin(i * arc + arc / 2) * 100);
                ctx.rotate(i * arc + arc / 2 + Math.PI / 2);
                ctx.fillText(segments[i], -ctx.measureText(segments[i]).width / 2, 0); ctx.restore();
            }
        }

        document.getElementById('btn-spin').onclick = async () => {
            const btn = document.getElementById('btn-spin');
            btn.disabled = true; btn.innerText = 'Sorteando...';
            try {
                const { data, error } = await supabase.functions.invoke('spin-roulette', { body: { round_id: currentRoundId } });
                if (error) throw error;
                const segments = [prizeName, "NADA", "GIRE +1", "NADA", prizeName, "NADA"];
                const targetIndex = segments.indexOf(data.prize);
                const spinAngle = (360 * 5) + (360 - (targetIndex * 60) - 30 + 270);
                canvas.style.transform = `rotate(${spinAngle}deg)`;
                setTimeout(() => showResult(data.prize), 4000);
            } catch (err) { alert("Erro ao girar: " + err.message); }
        };

        function showResult(prize) {
            document.getElementById('step-spin').classList.add('hidden');
            document.getElementById('step-result').classList.remove('hidden');
            const title = document.getElementById('result-title');
            const desc = document.getElementById('result-desc');
            const qr = document.getElementById('prize-qr');
            if (prize !== 'NADA' && prize !== 'GIRE +1') {
                title.innerText = "🍺 PARABÉNS!"; title.className = "text-3xl font-extrabold mb-4 text-yellow-400";
                desc.innerText = "Mostre este código no balcão!"; qr.classList.remove('hidden');
                new QRCode(qr, { text: `REDEEM:${currentRoundId}`, width: 150, height: 150 });
            } else {
                title.innerText = "😢 NÃO FOI DESSA VEZ"; title.className = "text-3xl font-extrabold mb-4 text-red-400";
                desc.innerText = "Tente novamente!";
            }
        }

        loadPrizes();
    