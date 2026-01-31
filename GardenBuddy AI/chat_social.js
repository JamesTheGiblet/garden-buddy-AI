// --- Social & Personality Logic ---

function detectUserMood(message) {
    const excited = /!{2,}|amazing|awesome|love|excited|great|wonderful|fantastic/i.test(message);
    const frustrated = /ugh|annoying|dying|help|worried|concerned|problem|issue|wrong/i.test(message);
    const curious = /\?|how|what|when|where|why|which/i.test(message);
    
    if (excited) return 'excited';
    if (frustrated) return 'concerned';
    if (curious) return 'curious';
    return 'neutral';
}

function analyzeUserLanguage(message) {
    const profile = conversationContext.languageProfile;
    
    // Detect formality
    const formalIndicators = /please|thank you|would you|could you|appreciate|kindly/i;
    const casualIndicators = /hey|yeah|yep|nope|gonna|wanna|cool|awesome/i;
    
    if (formalIndicators.test(message)) {
        profile.formality = 'formal';
    } else if (casualIndicators.test(message)) {
        profile.formality = 'casual';
    }
    
    // Track vocabulary
    const words = message.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(word => {
        if (word.length > 4 && !['that', 'this', 'have', 'with', 'from'].includes(word)) {
            profile.vocabulary.push(word);
            if (profile.vocabulary.length > 50) profile.vocabulary.shift();
        }
    });
    
    // Detect sentence length preference
    const sentenceCount = message.split(/[.!?]+/).filter(s => s.trim()).length;
    const avgLength = message.length / Math.max(sentenceCount, 1);
    
    if (avgLength < 30) profile.sentenceLength = 'short';
    else if (avgLength > 80) profile.sentenceLength = 'long';
    else profile.sentenceLength = 'medium';
    
    // Detect emoji usage
    if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(message)) {
        profile.usesEmojis = true;
    }
    
    // Detect slang/colloquialisms
    const slangPatterns = /gonna|wanna|kinda|sorta|dunno|ain't|y'all/i;
    if (slangPatterns.test(message)) {
        profile.usesSlang = true;
    }
    
    // Detect technical level
    const technicalTerms = /photosynthesis|nitrogen|ph level|micronutrients|propagation|dormancy|companion planting/i;
    if (technicalTerms.test(message)) {
        profile.technicalLevel = 'advanced';
    }
    
    // Detect greeting style
    if (/^(hi|hey|hello|yo|sup|howdy)/i.test(message)) {
        profile.preferredGreeting = message.match(/^(hi|hey|hello|yo|sup|howdy)/i)[0].toLowerCase();
    }

    // Detect regional variations
    if (/colour|fertiliser|organise|analyse|theatre/i.test(message)) {
        profile.region = 'UK';
    } else if (/color|fertilizer|organize|analyze|theater|fall season/i.test(message)) {
        profile.region = 'US';
    }
}

function adaptResponseToUserStyle(response) {
    const profile = conversationContext.languageProfile;
    
    // Adjust formality
    if (profile.formality === 'casual') {
        response = response
            .replace(/I would/g, "I'd")
            .replace(/You would/g, "You'd")
            .replace(/cannot/g, "can't")
            .replace(/do not/g, "don't")
            .replace(/Let me/g, "Let me")
            .replace(/That is/g, "That's")
            .replace(/It is/g, "It's");
    } else if (profile.formality === 'formal') {
        response = response
            .replace(/can't/g, "cannot")
            .replace(/don't/g, "do not")
            .replace(/won't/g, "will not")
            .replace(/it's/gi, "it is")
            .replace(/that's/gi, "that is");
    }
    
    // Match sentence length
    if (profile.sentenceLength === 'short') {
        response = response.replace(/,\s*and\s*/g, '. ');
    }
    
    // Adjust emoji usage
    if (!profile.usesEmojis) {
        const emojiCount = (response.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu) || []).length;
        if (emojiCount > 2) {
            let count = 0;
            response = response.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, (match) => {
                count++;
                return count <= 2 ? match : '';
            });
        }
    }
    
    // Mirror user's vocabulary
    if (profile.vocabulary.length > 10) {
        const userWords = [...new Set(profile.vocabulary)];
        if (userWords.includes('veggie') || userWords.includes('veggies')) {
            response = response.replace(/vegetables?/gi, 'veggies');
        }
        if (userWords.filter(w => w.includes('water')).length > 3) {
            response = response.replace(/irrigation/gi, 'watering');
        }
    }
    
    // Match slang usage
    if (profile.usesSlang) {
        response = response.replace(/going to/g, "gonna").replace(/want to/g, "wanna").replace(/kind of/g, "kinda");
    }
    
    // Adjust technical level
    if (profile.technicalLevel === 'basic') {
        response = response
            .replace(/photosynthesis/gi, 'how plants make food from sunlight')
            .replace(/nitrogen/gi, 'nutrients')
            .replace(/propagation/gi, 'growing new plants');
    }

    return response;
}

function applyRegionalVariations(response) {
    const profile = conversationContext.languageProfile;
    if (profile.region === 'UK') {
        response = response.replace(/color/gi, 'colour').replace(/fertilizer/gi, 'fertiliser').replace(/\bfall\b/gi, 'autumn').replace(/zucchini/gi, 'courgette').replace(/eggplant/gi, 'aubergine');
    }
    return response;
}

function getPersonalizedAck(mood) {
    const profile = conversationContext.languageProfile;
    const acknowledgments = {
        excited: { casual: ["That's awesome! 🎉", "Yes! Love it! ✨", "You're crushing it! 💪", "Garden goals! 🏆"], formal: ["That is excellent! 🎉", "Wonderful! ✨", "You are doing remarkably well! 💪", "Outstanding progress! 🏆"] },
        concerned: { casual: ["I hear you, let's fix this 🤝", "Don't worry, we got this 💚", "I'm here to help! 🌱"], formal: ["I understand. Let us resolve this together 🤝", "Please do not worry. We shall address this 💚", "I am here to assist you 🌱"] },
        curious: { casual: ["Great question! 💡", "Ooh, good one! 🤔", "Love that you're asking! 📚"], formal: ["Excellent question! 💡", "That is a very good inquiry! 🤔", "I appreciate your curiosity! 📚"] },
        neutral: { casual: ["Got it! 👍", "Perfect! ✓", "Cool, noted! 📝"], formal: ["Understood! 👍", "Very well! ✓", "Noted! 📝"] }
    };
    const style = profile.formality === 'formal' ? 'formal' : 'casual';
    const pool = (acknowledgments[mood] && acknowledgments[mood][style]) || acknowledgments.neutral[style];
    return pool[Math.floor(Math.random() * pool.length)];
}

function updateConversationFlow(message, responseType) {
    if (!conversationContext.flowPattern) conversationContext.flowPattern = [];
    conversationContext.flowPattern.push({ userMood: conversationContext.userMood, responseType: responseType, timestamp: Date.now() });
    if (conversationContext.flowPattern.length > 10) conversationContext.flowPattern.shift();
    const recentFlow = conversationContext.flowPattern.slice(-5);
    const chattiness = recentFlow.filter(f => f.userMood !== 'neutral' || f.responseType === 'advice').length;
    conversationContext.isChatty = chattiness >= 3;
}

function handleProTab() { if (isProUser) window.location.href = 'index.html#pro'; else showProLimitModal(); }
function showProLimitModal() { const modal = document.getElementById('upgradeModal'); if (modal) { modal.style.display = 'flex'; modal.classList.remove('upgrade-modal-hidden'); } }
function toggleProModal() { const modal = document.getElementById('upgradeModal'); if (modal) { modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex'; if (modal.style.display === 'flex') modal.classList.remove('upgrade-modal-hidden'); } }
function closeUpgradeModal() { document.getElementById('upgradeModal').style.display = 'none'; }
function selectPlan(plan) { console.log('Selected plan:', plan); }
function handleUpgrade(plan) {
    const email = currentUserEmail || prompt("Please enter your email address for the pro account:");
    if (!email) return;
    const subject = `Garden Buddy 4U Pro Upgrade Request - ${plan.toUpperCase()}`;
    const body = `I would like to upgrade to the ${plan} plan.\n\nUser ID: ${currentUserId || 'Guest'}\nEmail: ${email}\n\nPlease send me payment instructions.`;
    window.location.href = `mailto:gibletscreations@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeUpgradeModal();
}
function toggleShareModal() {
    const modal = document.getElementById('shareModal');
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') { const url = window.location.href; const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&ecc=H&margin=0`; document.getElementById('shareQrCode').src = qrUrl; const nativeBtn = document.getElementById('nativeShareBtn'); if (navigator.share) nativeBtn.style.display = 'inline-block'; else nativeBtn.style.display = 'none'; }
}
function copyShareLink() { navigator.clipboard.writeText(window.location.href).then(() => { alert('Link copied to clipboard!'); }); }
function shareNative() { if (navigator.share) navigator.share({ title: 'Garden Buddy 4U', text: 'Check out this AI garden assistant!', url: window.location.href }).catch(console.error); }