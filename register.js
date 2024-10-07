document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');

    if (success) {
        const notification = document.getElementById('notification');
        notification.textContent = 'Conta registrada com sucesso!';
        notification.style.display = 'block';
        notification.style.border = '2px solid #5e2b91'; // Borda roxa
        notification.style.backgroundColor = '#2c2c2c'; // Fundo escuro
        notification.style.color = '#ffffff'; // Texto branco
        notification.style.padding = '10px';
        notification.style.marginTop = '10px';
        notification.style.borderRadius = '5px';
        
        // Remove a notificação após 5 segundos
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
});
