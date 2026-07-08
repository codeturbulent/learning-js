document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('assignForm');
    const status = document.getElementById('status');
    const statusContent = document.getElementById('statusContent');
    const submitBtn = document.getElementById('submitBtn');
    const loader = document.getElementById('loader');
    const btnText = document.getElementById('btnText');
    const expiresAtInput = document.getElementById('expiresAt');
    const dateWarning = document.getElementById('dateWarning');
    
    // Chip Logic elements
    const emailContainer = document.getElementById('emailContainer');
    const emailInput = document.getElementById('emailInput');
    const emailCountDisplay = document.getElementById('emailCount');
    
    let emails = [];
    const MAX_EMAILS = 30;

    // Pre-fill expiration date to 30 days from now
    const now = new Date();
    now.setDate(now.getDate() + 30);
    const pad = (n) => n.toString().padStart(2, '0');
    const formattedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    expiresAtInput.value = formattedDate;

    // --- Chip Logic Functions ---
    
    const updateEmailCount = () => {
        emailCountDisplay.textContent = `${emails.length}/${MAX_EMAILS} Emails`;
        if (emails.length >= MAX_EMAILS) {
            emailInput.style.display = 'none';
        } else {
            emailInput.style.display = 'inline-block';
        }
    };

    const validateEmail = (email) => {
        return String(email)
            .toLowerCase()
            .match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
    };

    const renderChips = () => {
        // Remove all chips except the input
        const existingChips = emailContainer.querySelectorAll('.chip');
        existingChips.forEach(chip => chip.remove());

        emails.forEach((email, index) => {
            const chip = document.createElement('div');
            chip.className = 'chip bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center shadow-sm';
            chip.innerHTML = `
                <span>${email}</span>
                <button type="button" class="ml-2 focus:outline-none hover:text-indigo-200 transition-colors" data-index="${index}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `;
            
            // Add click listener to remove button
            chip.querySelector('button').onclick = () => {
                emails.splice(index, 1);
                renderChips();
                updateEmailCount();
            };

            emailContainer.insertBefore(chip, emailInput);
        });
    };

    const addEmail = (val) => {
        const cleanVal = val.trim().replace(/,/g, '');
        if (cleanVal && validateEmail(cleanVal) && !emails.includes(cleanVal)) {
            if (emails.length < MAX_EMAILS) {
                emails.push(cleanVal);
                renderChips();
                updateEmailCount();
                emailInput.value = '';
            }
        } else {
            emailInput.value = cleanVal; // Keep it if invalid for correction
        }
    };

    // --- Event Listeners ---

    emailContainer.onclick = () => emailInput.focus();

    emailInput.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            addEmail(emailInput.value);
        } else if (e.key === 'Backspace' && !emailInput.value && emails.length > 0) {
            emails.pop();
            renderChips();
            updateEmailCount();
        }
    };

    emailInput.onkeyup = (e) => {
        if (e.key === ',') {
            addEmail(emailInput.value);
        }
    };

    // Handle blur (tabbing away)
    emailInput.onblur = () => {
        addEmail(emailInput.value);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Final attempt to add whatever is in the input
        addEmail(emailInput.value);

        status.classList.add('hidden');
        dateWarning.classList.add('hidden');

        if (emails.length === 0) {
            status.classList.remove('hidden');
            statusContent.className = 'p-5 rounded-2xl text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200';
            statusContent.innerHTML = 'Please add at least one email address.';
            return;
        }

        const plan_id = document.getElementById('plan_id').value;
        const expiresAtStr = expiresAtInput.value;
        const expiresAt = new Date(expiresAtStr);
        const minDate = new Date();
        minDate.setDate(minDate.getDate() + 2);

        if (expiresAt <= minDate) {
            dateWarning.classList.remove('hidden');
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        loader.classList.remove('hidden');
        btnText.classList.add('opacity-0');

        try {
            const response = await fetch('/api/assign-plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    emails,
                    plan_id,
                    expiresAt: expiresAt.toISOString()
                })
            });

            const data = await response.json();

            status.classList.remove('hidden');
            if (response.ok) {
                statusContent.className = 'p-5 rounded-2xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200';
                statusContent.innerHTML = `
                    <div class="flex items-center">
                        <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>Successfully updated <strong>${data.updatedUsers || emails.length}</strong> user(s).</span>
                    </div>
                `;
                emails = [];
                renderChips();
                updateEmailCount();
                form.reset();
                expiresAtInput.value = formattedDate;
            } else {
                statusContent.className = 'p-5 rounded-2xl text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200';
                statusContent.innerHTML = `
                    <div class="font-bold">Execution Failed</div>
                    <div class="mt-1 opacity-80">${data.error || 'Unknown error occurred.'}</div>
                    ${data.details ? `<div class="mt-2 text-xs font-mono bg-white/50 p-2 rounded">${data.details}</div>` : ''}
                `;
            }
        } catch (error) {
            status.classList.remove('hidden');
            statusContent.className = 'p-5 rounded-2xl text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200';
            statusContent.innerHTML = `<strong>Critical Error:</strong> Network connectivity issue or server offline.`;
        } finally {
            submitBtn.disabled = false;
            loader.classList.add('hidden');
            btnText.classList.remove('opacity-0');
        }
    });
});
