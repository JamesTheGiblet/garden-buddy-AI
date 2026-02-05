document.addEventListener('DOMContentLoaded', () => {
    // Landing Page Info Modal Logic
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
        const infoModal = document.getElementById('infoModal');
        const closeModal = document.getElementById('closeModal');

        function toggleModal() {
            infoModal.classList.toggle('active');
        }

        infoBtn.addEventListener('click', toggleModal);
        closeModal.addEventListener('click', toggleModal);
        
        // Close on outside click
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                toggleModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && infoModal.classList.contains('active')) {
                toggleModal();
            }
        });
    }

    // FAQ Toggle Logic
    document.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.faq-answer')) return;
            item.classList.toggle('active');
        });
    });
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.problem-card, .solution-card, .pricing-card, .faq-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});