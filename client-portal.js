// Current session data
let currentClient = null;
let currentOrders = [];
let selectedOrder = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');
const ordersGrid = document.getElementById('ordersGrid');
const orderModal = document.getElementById('orderModal');
const logoutBtn = document.getElementById('logoutBtn');
const modalClose = document.getElementById('modalClose');

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
modalClose.addEventListener('click', closeModal);

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        switchTab(tabName);
    });
});

// Close modal when clicking outside
orderModal.addEventListener('click', (e) => {
    if (e.target === orderModal) {
        closeModal();
    }
});

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    const orderCode = document.getElementById('orderCode').value.trim().toUpperCase();
    
    console.log('Login attempt with code:', orderCode);
    
    // Check if Firebase is ready
    if (!window.db || !window.firestore) {
        console.error('Firebase not initialized!');
        showError('Firebase belum siap. Pastikan Anda sudah setup Firebase config.');
        return;
    }
    
    console.log('Firebase ready, querying...');
    
    try {
        // Query Firestore for orders with this code
        const q = window.firestore.query(
            window.firestore.collection(window.db, 'orders'),
            window.firestore.where('orderCode', '==', orderCode)
        );
        
        console.log('Query created, fetching docs...');
        const querySnapshot = await window.firestore.getDocs(q);
        console.log('Query result:', querySnapshot.empty ? 'No orders found' : `Found ${querySnapshot.size} order(s)`);
        
        if (querySnapshot.empty) {
            showError('Kode order tidak ditemukan');
            return;
        }
        
        // Get all orders for this client
        currentOrders = [];
        querySnapshot.forEach((doc) => {
            console.log('Order found:', doc.id, doc.data());
            currentOrders.push({ id: doc.id, ...doc.data() });
        });
        
        // Store session
        currentClient = orderCode;
        sessionStorage.setItem('clientCode', orderCode);
        
        // Show dashboard
        showDashboard();
        
    } catch (error) {
        console.error('Login error:', error);
        console.error('Error details:', error.message, error.code);
        showError('Terjadi kesalahan: ' + error.message + '\n\nPeriksa Console (F12) untuk detail.');
    }
}

// Show Dashboard
function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    dashboard.classList.add('show');
    renderOrders();
}

// Render Orders
function renderOrders() {
    ordersGrid.innerHTML = '';
    
    currentOrders.forEach(order => {
        const orderCard = createOrderCard(order);
        ordersGrid.appendChild(orderCard);
    });
}

// Create Order Card
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.onclick = () => openOrderDetail(order);
    
    // Calculate actual price from invoice if exists
    let displayPrice = order.totalPrice;
    if (order.invoiceData && order.invoiceData.items) {
        displayPrice = order.invoiceData.items.reduce((total, item) => {
            return total + ((item.price * item.quantity) - (item.discount || 0));
        }, 0);
    }
    
    const progress = calculateProgress(order.status, order.currentStage);
    const statusClass = getStatusClass(order.status);
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-code">${order.orderCode}</div>
            <span class="status-badge ${statusClass}">${order.status}</span>
        </div>
        <div class="order-details">
            <p><strong>Item:</strong> ${order.itemName || 'N/A'}</p>
            <p><strong>Deadline:</strong> ${formatDate(order.deadline)}</p>
            <p><strong>Total:</strong> ${formatCurrency(displayPrice)}</p>
            ${order.status === 'In Progress' ? `<p><strong>Stage:</strong> ${order.currentStage}</p>` : ''}
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
    `;
    
    return card;
}

// Open Order Detail
function openOrderDetail(order) {
    selectedOrder = order;
    
    document.getElementById('modalOrderCode').textContent = order.orderCode;
    document.getElementById('modalStatus').className = `status-badge ${getStatusClass(order.status)}`;
    document.getElementById('modalStatus').textContent = order.status;
    
    // Populate overview tab
    populateOverviewTab(order);
    
    // Populate workflow tab
    populateWorkflowTab(order);
    
    // Populate invoice tab
    populateInvoiceTab(order);
    
    orderModal.classList.add('show');
}

// Close Modal
function closeModal() {
    orderModal.classList.remove('show');
    selectedOrder = null;
}

// Switch Tab
function switchTab(tabName) {
    // Remove active from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Add active to selected
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Populate Overview Tab
function populateOverviewTab(order) {
    // Calculate actual price from invoice
    let actualPrice = order.totalPrice;
    if (order.invoiceData && order.invoiceData.items) {
        actualPrice = order.invoiceData.items.reduce((total, item) => {
            return total + ((item.price * item.quantity) - (item.discount || 0));
        }, 0);
    }
    
    // Order Details (simplified)
    const orderDetailsGrid = document.getElementById('orderDetailsGrid');
    orderDetailsGrid.innerHTML = `
        <div class="detail-item">
            <label>Kode Order</label>
            <div class="value">${order.orderCode}</div>
        </div>
        <div class="detail-item">
            <label>Item</label>
            <div class="value">${order.itemName || 'N/A'}</div>
        </div>
    `;
    
    // Payment Details with DP info
    const paymentDetailsGrid = document.getElementById('paymentDetailsGrid');
    
    let paymentHTML = '';
    
    // Calculate DP and remaining
    const dpAmount = Math.round(actualPrice * 0.5);
    const remainingAmount = actualPrice - dpAmount + (order.revisionCharges || 0);
    const paymentType = order.paymentType || 'dp'; // default to DP
    
    if (order.paymentStatus === 'Belum Bayar') {
        if (paymentType === 'full') {
            // Full payment type
            paymentHTML = `
                <div class="detail-item">
                    <label>Total Harga</label>
                    <div class="value">${formatCurrency(actualPrice)}</div>
                </div>
                <div class="detail-item">
                    <label>Status Pembayaran</label>
                    <div class="value" style="color: #f57c00;">⏳ Menunggu Approval Rough Sketch</div>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50;">
                        <strong style="color: #2e7d32;">💰 Sistem Pembayaran: FULL PAYMENT</strong>
                        <p style="margin: 10px 0 0 0; line-height: 1.8;">
                            Pembayaran <strong>lunas 100%</strong> (${formatCurrency(actualPrice)}) setelah rough sketch disetujui.
                        </p>
                    </div>
                </div>
            `;
        } else {
            // DP payment type
            paymentHTML = `
                <div class="detail-item">
                    <label>Total Harga</label>
                    <div class="value">${formatCurrency(actualPrice)}</div>
                </div>
                <div class="detail-item">
                    <label>Status Pembayaran</label>
                    <div class="value" style="color: #f57c00;">⏳ Menunggu Approval Rough Sketch</div>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800;">
                        <strong style="color: #ef6c00;">ℹ️ Sistem Pembayaran: DOWN PAYMENT (DP)</strong>
                        <ol style="margin: 10px 0 0 20px; line-height: 1.8;">
                            <li><strong>DP 50%</strong> (${formatCurrency(dpAmount)}) setelah rough sketch disetujui</li>
                            <li><strong>Pelunasan 50%</strong> (${formatCurrency(actualPrice - dpAmount)}) setelah finishing untuk mendapatkan file final</li>
                        </ol>
                    </div>
                </div>
            `;
        }
    } else if (order.paymentStatus === 'DP 50%') {
        paymentHTML = `
            <div class="detail-item">
                <label>Total Harga</label>
                <div class="value">${formatCurrency(actualPrice)}</div>
            </div>
            <div class="detail-item">
                <label>DP (50%) - Lunas</label>
                <div class="value" style="color: #4caf50;">✅ ${formatCurrency(dpAmount)}</div>
            </div>
            <div class="detail-item">
                <label>Sisa Pembayaran</label>
                <div class="value">${formatCurrency(remainingAmount)}</div>
            </div>
            ${order.revisionCharges > 0 ? `
                <div class="detail-item">
                    <label>Biaya Revisi Mayor Tambahan</label>
                    <div class="value" style="color: #f57c00;">${formatCurrency(order.revisionCharges)}</div>
                </div>
            ` : ''}
            <div class="detail-item" style="grid-column: 1 / -1;">
                <div style="background: ${order.refundable === 'yes' ? '#e8f5e9' : '#ffebee'}; padding: 15px; border-radius: 8px; border-left: 4px solid ${order.refundable === 'yes' ? '#4caf50' : '#f44336'};">
                    <strong style="color: ${order.refundable === 'yes' ? '#2e7d32' : '#c62828'};">
                        ${order.refundable === 'yes' ? '✅ Refund Masih Tersedia' : '⚠️ No Refund Policy'}
                    </strong>
                    <p style="margin: 8px 0 0 0; font-size: 14px;">
                        ${order.refundable === 'yes' 
                            ? 'Anda masih bisa request refund karena pekerjaan belum dimulai ke Visual Sketch.' 
                            : 'Pekerjaan sudah masuk ke Visual Sketch. Refund tidak dapat dilakukan.'}
                    </p>
                </div>
            </div>
        `;
    } else if (order.paymentStatus === 'Lunas') {
        paymentHTML = `
            <div class="detail-item">
                <label>Total Harga</label>
                <div class="value">${formatCurrency(actualPrice)}</div>
            </div>
            ${order.revisionCharges > 0 ? `
                <div class="detail-item">
                    <label>Biaya Revisi Mayor</label>
                    <div class="value">${formatCurrency(order.revisionCharges)}</div>
                </div>
            ` : ''}
            <div class="detail-item">
                <label>Total Dibayar</label>
                <div class="value" style="color: #4caf50; font-size: 18px; font-weight: bold;">
                    ✅ ${formatCurrency(actualPrice + (order.revisionCharges || 0))}
                </div>
            </div>
            <div class="detail-item" style="grid-column: 1 / -1;">
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong style="color: #2e7d32; font-size: 16px;">🎉 Pembayaran Lunas!</strong>
                    <p style="margin: 8px 0 0 0;">Terima kasih! File final Anda sudah tersedia.</p>
                </div>
            </div>
        `;
    }
    
    paymentDetailsGrid.innerHTML = paymentHTML;
    
    // No revision info here - moved to workflow tab
    const revisionSection = document.getElementById('revisionSection');
    revisionSection.innerHTML = '';
}

// Populate Workflow Tab
function populateWorkflowTab(order) {
    const stages = ['Concept', 'Sketching', 'Cleaning', 'Rendering', 'Finishing'];
    const currentStageIndex = stages.indexOf(order.currentStage);
    
    const workflowStages = document.getElementById('workflowStages');
    workflowStages.innerHTML = stages.map((stage, index) => {
        let stageClass = '';
        
        // If canceled, nothing is green
        if (order.status === 'Canceled') {
            stageClass = '';
        }
        // If Done, all green
        else if (order.status === 'Done') {
            stageClass = 'completed';
        }
        // Otherwise, check current stage
        else {
            if (index < currentStageIndex) {
                stageClass = 'completed'; // Green for past stages
            } else if (index === currentStageIndex) {
                stageClass = 'active'; // Purple for current stage
            }
        }
        
        return `
            <div class="workflow-stage ${stageClass}">
                <div class="stage-icon">${index + 1}</div>
                <div class="stage-name">${stage}</div>
            </div>
        `;
    }).join('');
    
    // Stage descriptions
    const descriptions = {
        'Concept': 'Tahap perencanaan dan brainstorming konsep artwork',
        'Sketching': 'Pembuatan sketsa awal dan komposisi',
        'Cleaning': 'Pembersihan lineart dan persiapan coloring',
        'Rendering': 'Proses pewarnaan dan shading',
        'Finishing': 'Touch-up akhir dan quality check'
    };
    
    // Detailed revision info per stage
    const revisionDetails = {
        'Concept': {
            current: ['Revisi atau request apa saja'],
            next: {
                stage: 'Sketching',
                mayor: ['Konsep keseluruhan', 'Komposisi atau perspektif', 'Pose & ekspresi', 'Desain karakter (OC atau outfit)'],
                minor: ['Elemen background', 'Rasio kanvas (portrait/landscape/square)']
            }
        },
        'Sketching': {
            current: {
                mayor: ['Konsep keseluruhan', 'Komposisi atau perspektif', 'Pose & ekspresi', 'Desain karakter (OC atau outfit)'],
                minor: ['Elemen background', 'Rasio kanvas (portrait/landscape/square)']
            },
            next: {
                stage: 'Cleaning',
                mayor: ['Skema warna dasar / tone warna (pastel, vibrant, kontras, dark tone)'],
                minor: ['Warna lineart']
            }
        },
        'Cleaning': {
            current: {
                mayor: ['Skema warna dasar / tone warna (pastel, vibrant, kontras, dark tone)'],
                minor: ['Warna lineart']
            },
            next: {
                stage: 'Rendering',
                mayor: ['Warna (jika terlalu gelap/terang, missmatch dari referensi)', 'Arah cahaya dan bayangan', 'Intensitas pencahayaan'],
                minor: []
            }
        },
        'Rendering': {
            current: {
                mayor: ['Warna (jika terlalu gelap/terang, missmatch dari referensi)', 'Arah cahaya dan bayangan', 'Intensitas pencahayaan'],
                minor: []
            },
            next: {
                stage: 'Finishing',
                mayor: ['Koreksi vibe warna agar sesuai mood'],
                minor: ['Warna filter / efek warna (cool tone, warm tone, dreamy)', 'Tone curve', 'Efek (Blur, Noise, Gradient Map)']
            }
        },
        'Finishing': {
            current: {
                mayor: ['Koreksi vibe warna agar sesuai mood'],
                minor: ['Warna filter / efek warna (cool tone, warm tone, dreamy)', 'Tone curve', 'Efek (Blur, Noise, Gradient Map)']
            },
            next: {
                stage: 'Done',
                message: 'Setelah stage Finishing selesai, order akan ditandai sebagai Done dan file final akan tersedia.'
            }
        }
    };
    
    let progressArtHTML = '';
    if (order.progressArt) {
        // Build revision history HTML to show beside art
        let revisionHistoryHTML = '';
        if (order.revisionHistoryFree && order.revisionHistoryFree.trim()) {
            revisionHistoryHTML += `
                <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #4caf50;">
                    <strong style="color: #2e7d32; font-size: 14px;">✅ Revisi Gratis:</strong>
                    <pre style="margin: 8px 0 0 0; font-family: inherit; white-space: pre-wrap; font-size: 13px; color: #555;">${order.revisionHistoryFree}</pre>
                </div>
            `;
        }
        if (order.revisionHistoryPaid && order.revisionHistoryPaid.trim()) {
            revisionHistoryHTML += `
                <div style="background: #fff3e0; padding: 12px; border-radius: 8px; border-left: 3px solid #ff9800;">
                    <strong style="color: #ef6c00; font-size: 14px;">💰 Revisi Berbayar:</strong>
                    <pre style="margin: 8px 0 0 0; font-family: inherit; white-space: pre-wrap; font-size: 13px; color: #555;">${order.revisionHistoryPaid}</pre>
                    ${order.revisionCharges > 0 ? `<div style="margin-top: 8px; font-weight: 600; color: #ef6c00;">Total: ${formatCurrency(order.revisionCharges)}</div>` : ''}
                </div>
            `;
        }
        
        progressArtHTML = `
            <div class="detail-item" style="grid-column: 1 / -1;">
                <label>Progress Terbaru & Riwayat Revisi</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px;">
                    <div>
                        <img src="${order.progressArt}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    </div>
                    <div>
                        ${revisionHistoryHTML || '<p style="color: #999; font-size: 14px;">Belum ada riwayat revisi</p>'}
                    </div>
                </div>
            </div>
        `;
    }
    
    // Revision Info - only show if NOT Done or Canceled
    let revisionHTML = '';
    const canShowRevision = order.status !== 'Done' && order.status !== 'Canceled';
    
    if (canShowRevision && order.revisionAllowed && order.currentStage) {
        const stageRevision = revisionDetails[order.currentStage];
        
        if (stageRevision) {
            let currentRevisionHTML = '';
            
            // Show current stage revision
            if (Array.isArray(stageRevision.current)) {
                // Concept stage - anything goes
                currentRevisionHTML = `
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <strong style="color: #2e7d32;">✅ Revisi di Stage ${order.currentStage}:</strong>
                        <ul style="margin: 10px 0 0 20px;">
                            ${stageRevision.current.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </div>
                `;
            } else {
                // Other stages - mayor/minor
                currentRevisionHTML = `
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <strong style="color: #2e7d32;">✅ Revisi di Stage ${order.currentStage}:</strong>
                        ${stageRevision.current.mayor.length > 0 ? `
                            <p style="margin: 10px 0 5px 0;"><strong>🟥 Mayor (gunakan revisi remaining):</strong></p>
                            <ul style="margin: 5px 0 0 20px;">
                                ${stageRevision.current.mayor.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${stageRevision.current.minor.length > 0 ? `
                            <p style="margin: 10px 0 5px 0;"><strong>🟩 Minor (tidak mengurangi revisi):</strong></p>
                            <ul style="margin: 5px 0 0 20px;">
                                ${stageRevision.current.minor.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        ` : ''}
                        <p style="margin-top: 10px; font-size: 14px; color: #666;">
                            <strong>Revisi Mayor Tersisa:</strong> ${order.revisionRemaining} kali
                            ${order.revisionRemaining === 0 ? '<br><span style="color: #d32f2f;">⚠️ Revisi mayor setelah ini akan dikenakan biaya Rp15.000 per revisi.</span>' : ''}
                        </p>
                    </div>
                `;
            }
            
            // Show next stage info
            let nextStageHTML = '';
            if (stageRevision.next.stage === 'Done') {
                nextStageHTML = `
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px;">
                        <strong style="color: #ef6c00;">📦 Setelah Stage Ini:</strong>
                        <p style="margin: 10px 0 0 0;">${stageRevision.next.message}</p>
                    </div>
                `;
            } else if (stageRevision.next.mayor || stageRevision.next.minor) {
                nextStageHTML = `
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">
                        <strong style="color: #1565c0;">ℹ️ Preview: Revisi di Stage ${stageRevision.next.stage}:</strong>
                        ${stageRevision.next.mayor && stageRevision.next.mayor.length > 0 ? `
                            <p style="margin: 10px 0 5px 0;"><strong>🟥 Mayor:</strong></p>
                            <ul style="margin: 5px 0 0 20px;">
                                ${stageRevision.next.mayor.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        ` : ''}
                        ${stageRevision.next.minor && stageRevision.next.minor.length > 0 ? `
                            <p style="margin: 10px 0 5px 0;"><strong>🟩 Minor:</strong></p>
                            <ul style="margin: 5px 0 0 20px;">
                                ${stageRevision.next.minor.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        ` : ''}
                        <p style="margin-top: 10px; font-size: 13px; color: #666; font-style: italic;">
                            💡 Revisi di luar ketentuan atau revisi mayor sehabis 5 kali akan dikenakan biaya tambahan Rp15.000 per revisi.
                        </p>
                    </div>
                `;
            }
            
            revisionHTML = `
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <label>Informasi Revisi</label>
                    <div style="margin-top: 10px;">
                        ${currentRevisionHTML}
                        ${nextStageHTML}
                    </div>
                </div>
            `;
        }
    }
    
    // Calculate time since last update
    let lastUpdateText = 'Tidak ada update';
    if (order.updatedAt) {
        const lastUpdate = new Date(order.updatedAt);
        const now = new Date();
        const diffMs = now - lastUpdate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            lastUpdateText = 'Baru saja';
        } else if (diffMins < 60) {
            lastUpdateText = `${diffMins} menit yang lalu`;
        } else if (diffHours < 24) {
            lastUpdateText = `${diffHours} jam yang lalu`;
        } else {
            lastUpdateText = `${diffDays} hari yang lalu`;
        }
    }
    
    const stageDescription = document.getElementById('stageDescription');
    
    // If done, show completion message
    if (order.status === 'Done') {
        stageDescription.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item" style="grid-column: 1 / -1; text-align: center; padding: 30px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #30cfd0 0%, #38ef7d 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <i class="fas fa-check" style="font-size: 40px; color: white;"></i>
                    </div>
                    <h3 style="color: #38ef7d; margin-bottom: 10px;">Order Selesai!</h3>
                    <p style="color: #666;">Terima kasih atas kesabarannya. Semua tahap pengerjaan telah selesai.</p>
                </div>
            </div>
        `;
    } else {
        stageDescription.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item">
                    <label>Stage Saat Ini</label>
                    <div class="value">${order.currentStage || 'Belum Dimulai'}</div>
                </div>
                <div class="detail-item">
                    <label>Deskripsi</label>
                    <div class="value">${descriptions[order.currentStage] || 'Menunggu pembayaran untuk memulai'}</div>
                </div>
                ${order.deadline ? `
                    <div class="detail-item">
                        <label>Deadline Pengerjaan</label>
                        <div class="value">${formatDate(order.deadline)}</div>
                    </div>
                ` : ''}
                <div class="detail-item">
                    <label>Update Terakhir</label>
                    <div class="value">${lastUpdateText}</div>
                </div>
                ${progressArtHTML}
                ${revisionHTML}
            </div>
        `;
    }
}

// Populate Invoice Tab
function populateInvoiceTab(order) {
    const invoiceFrame = document.getElementById('invoiceFrame');
    const invoicePreview = document.getElementById('invoicePreview');
    const downloadButtons = document.querySelector('.download-buttons');
    
    // Check if invoice is locked (not visible yet)
    if (!order.invoiceVisible && (order.paymentStatus === 'Belum Bayar' || !order.paymentStatus)) {
        invoicePreview.innerHTML = `
            <div style="text-align: center; padding: 60px 40px;">
                <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #ffd93d 0%, #ffc107 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 25px;">
                    <i class="fas fa-lock" style="font-size: 45px; color: #856404;"></i>
                </div>
                <h3 style="color: #856404; margin-bottom: 15px;">Invoice Belum Tersedia</h3>
                <p style="color: #666; line-height: 1.6; max-width: 500px; margin: 0 auto;">
                    Invoice untuk <strong>DP 50%</strong> akan terbuka setelah <strong>rough sketch</strong> Anda disetujui.<br><br>
                    Kami masih dalam tahap perencanaan dan pembuatan sketsa.<br><br>
                    Silakan tunggu konfirmasi dari kami untuk approval sketch, kemudian invoice DP akan dibuka.
                </p>
            </div>
        `;
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'none';
        return;
    }
    
    // Calculate amounts
    const dpAmount = Math.round((order.invoiceData && order.invoiceData.items ? 
        order.invoiceData.items.reduce((total, item) => {
            return total + ((item.price * item.quantity) - (item.discount || 0));
        }, 0) : order.totalPrice) * 0.5);
    
    const fullAmount = order.invoiceData && order.invoiceData.items ? 
        order.invoiceData.items.reduce((total, item) => {
            return total + ((item.price * item.quantity) - (item.discount || 0));
        }, 0) : order.totalPrice;
    
    const remainingAmount = fullAmount - dpAmount + (order.revisionCharges || 0);
    
    // Check if at finishing stage - show Google Drive button
    if (order.currentStage === 'Finishing' && order.paymentStatus === 'DP 50%') {
        invoicePreview.innerHTML = `
            <div style="padding: 30px; text-align: center;">
                <h2 style="color: #667eea; margin-bottom: 20px;">💳 Pelunasan untuk File Final</h2>
                <p style="color: #666; margin-bottom: 20px;">Artwork Anda sudah selesai! Cek preview di tab Workflow.</p>
                
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px; color: white; margin-top: 20px;">
                    <h3 style="margin: 0 0 15px 0;">Total Pelunasan</h3>
                    <div style="font-size: 32px; font-weight: bold; margin: 15px 0;">
                        ${formatCurrency(remainingAmount)}
                    </div>
                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 20px;">
                        Sisa 50%: ${formatCurrency(fullAmount - dpAmount)}
                        ${order.revisionCharges > 0 ? ` + Biaya Revisi: ${formatCurrency(order.revisionCharges)}` : ''}
                    </div>
                    
                    ${order.invoiceData && order.invoiceData.qrisImage ? `
                        <div style="background: white; padding: 20px; border-radius: 12px; display: inline-block; margin-top: 10px;">
                            <p style="color: #667eea; font-weight: 600; margin-bottom: 15px;">Scan QRIS untuk Pelunasan:</p>
                            <img src="${order.invoiceData.qrisImage}" style="max-width: 250px; border-radius: 8px;">
                        </div>
                    ` : ''}
                    
                    <p style="margin-top: 20px; font-size: 14px; opacity: 0.9;">
                        Setelah pelunasan, file final tanpa watermark akan tersedia di Google Drive
                    </p>
                </div>
                
                <div style="margin-top: 30px;">
                    <button onclick="handleGDriveClick('${order.status}', '${order.gdriveLink || ''}')" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                        <i class="fas fa-folder"></i> Akses File Final di Google Drive
                    </button>
                </div>
            </div>
        `;
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'none';
        return;
    }
    
    // Check if payment is complete
    if (order.paymentStatus === 'Lunas') {
        const revisionCharges = order.revisionCharges || 0;
        const fullAmount2 = order.invoiceData && order.invoiceData.items ?
            order.invoiceData.items.reduce((t, i) => t + ((i.price * i.quantity) - (i.discount || 0)), 0)
            : (order.totalPrice || 0);
        const totalPaid = fullAmount2 + revisionCharges;
        invoicePreview.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #30cfd0 0%, #38ef7d 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i class="fas fa-check" style="font-size: 40px; color: white;"></i>
                </div>
                <h3 style="color: #38ef7d; margin-bottom: 15px;">Pembayaran Lunas!</h3>
                <p style="color: #666; margin-bottom: 10px;">Terima kasih atas pembayaran penuh Anda.</p>
                ${revisionCharges > 0 ? `
                    <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 10px; padding: 15px; max-width: 360px; margin: 15px auto; text-align: left;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666; font-size: 14px;">Harga komisioner</span>
                            <span style="font-weight: 600;">Rp${fullAmount2.toLocaleString('id-ID')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #ef6c00; font-size: 14px;">Biaya revisi tambahan</span>
                            <span style="color: #ef6c00; font-weight: 600;">+ Rp${revisionCharges.toLocaleString('id-ID')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #ffe082;">
                            <span style="font-weight: 700;">Total Dibayar</span>
                            <span style="font-weight: 700; color: #2e7d32;">Rp${totalPaid.toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                ` : ''}
                
                ${order.status === 'Done' && order.gdriveLink ? `
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 16px; margin-top: 30px;">
                        <h4 style="color: white; margin-bottom: 15px;">📦 File Final Tersedia!</h4>
                        <p style="color: white; opacity: 0.9; margin-bottom: 20px;">File tanpa watermark sudah siap didownload</p>
                        <a href="${order.gdriveLink}" target="_blank" style="display: inline-block; background: white; color: #667eea; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px;">
                            <i class="fas fa-download"></i> Download dari Google Drive
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'none';
    } else if (order.paymentStatus === 'DP 50%' && order.currentStage !== 'Finishing') {
        // DP already paid but not yet at finishing — show confirmation instead of confusing DP invoice
        invoicePreview.innerHTML = `
            <div style="text-align: center; padding: 50px 30px;">
                <div style="width: 90px; height: 90px; background: linear-gradient(135deg, #4caf50 0%, #81c784 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 25px; box-shadow: 0 8px 24px rgba(76,175,80,0.3);">
                    <i class="fas fa-check" style="font-size: 42px; color: white;"></i>
                </div>
                <h3 style="color: #2e7d32; margin-bottom: 12px; font-size: 22px;">DP 50% Sudah Diterima!</h3>
                <p style="color: #555; line-height: 1.7; max-width: 480px; margin: 0 auto 25px;">
                    Terima kasih! Pembayaran DP 50% kamu sudah kami terima dan pengerjaan sedang berlangsung.
                </p>

                <div style="background: #f3f8ff; border: 1px solid #c5d8f7; border-radius: 12px; padding: 20px; max-width: 400px; margin: 0 auto 25px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="color: #666; font-size: 14px;">DP yang dibayar (50%)</span>
                        <span style="color: #2e7d32; font-weight: 700;">${formatCurrency(dpAmount)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #dde8f8;">
                        <span style="color: #666; font-size: 14px;">Sisa pelunasan nanti</span>
                        <span style="color: #ef6c00; font-weight: 700;">${formatCurrency(remainingAmount)}</span>
                    </div>
                </div>

                <div style="background: #fff8e1; border-left: 4px solid #ffb300; border-radius: 8px; padding: 15px; max-width: 480px; margin: 0 auto; text-align: left;">
                    <strong style="color: #e65100; font-size: 14px;">ℹ️ Pelunasan 50% + biaya revisi mayor (jika ada)</strong>
                    <p style="margin: 8px 0 0 0; font-size: 13px; color: #555; line-height: 1.6;">
                        Invoice pelunasan akan muncul di sini ketika artwork sudah sampai tahap <strong>Finishing</strong> dan siap untuk pengiriman file final.
                    </p>
                </div>
            </div>
        `;
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'none';
    } else if (order.invoiceData) {
        // Show invoice based on payment type
        const invoice = order.invoiceData;
        const paymentType = order.paymentType || 'dp';
        let total = 0;
        const itemsHTML = invoice.items.map(item => {
            const itemTotal = (item.price * item.quantity) - (item.discount || 0);
            total += itemTotal;
            
            // Add discount description if exists
            let discountDescHTML = '';
            if (item.discount > 0 && item.discountDesc) {
                discountDescHTML = `<div style="font-size: 12px; color: #666; opacity: 0.8; font-style: italic; margin-top: 3px;">- ${item.discountDesc} (Rp${item.discount.toLocaleString('id-ID')})</div>`;
            }
            const discountNominalHTML = item.discount > 0
                ? `<div style="font-size: 11px; color: #999; opacity: 0.75; margin-top: 2px;">- Rp${item.discount.toLocaleString('id-ID')}</div>`
                : '';
            
            return `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                        ${item.name}
                        ${discountDescHTML}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                        Rp${item.price.toLocaleString('id-ID')}
                        ${discountNominalHTML}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">Rp${itemTotal.toLocaleString('id-ID')}</td>
                </tr>
            `;
        }).join('');
        
        const dpTotal = Math.round(total * 0.5);
        
        // Choose invoice format based on payment type
        if (paymentType === 'full') {
            // FULL PAYMENT INVOICE
            const revisionCharges = order.revisionCharges || 0;
            const grandTotal = total + revisionCharges;
            const revisionRowHTML = revisionCharges > 0 ? `
                <tr style="background: #fff8e1;">
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                        <div>Biaya Revisi Mayor Tambahan</div>
                        <div style="font-size: 12px; color: #ef6c00; opacity: 0.85; font-style: italic; margin-top: 3px;">
                            ${order.revisionHistoryPaid ? order.revisionHistoryPaid.trim() : 'Revisi mayor di luar jatah'}
                        </div>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; color: #ef6c00;">+Rp${revisionCharges.toLocaleString('id-ID')}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">—</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; color: #ef6c00; font-weight: 600;">Rp${revisionCharges.toLocaleString('id-ID')}</td>
                </tr>
            ` : '';

            invoicePreview.innerHTML = `
                <div style="padding: 30px;">
                    <div style="border-bottom: 3px solid #667eea; padding-bottom: 15px; margin-bottom: 20px;">
                        <h1 style="color: #667eea; font-size: 36px; margin: 0;">INVOICE</h1>
                        <div style="color: #666; font-size: 20px; margin-top: 5px;">${invoice.invoiceNumber}</div>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <strong style="color: #667eea;">Kepada:</strong><br>
                        <div style="margin-top: 8px; font-size: 16px;">${order.clientName}</div>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                <th style="padding: 12px; text-align: left;">Item</th>
                                <th style="padding: 12px; text-align: left;">Harga Satuan</th>
                                <th style="padding: 12px; text-align: center;">Jumlah</th>
                                <th style="padding: 12px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                            ${revisionRowHTML}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; margin-top: 25px;">
                        ${revisionCharges > 0 ? `
                            <div style="font-size: 15px; color: #666; margin-bottom: 6px;">
                                Subtotal: Rp${total.toLocaleString('id-ID')}
                            </div>
                            <div style="font-size: 15px; color: #ef6c00; margin-bottom: 10px;">
                                + Biaya Revisi: Rp${revisionCharges.toLocaleString('id-ID')}
                            </div>
                        ` : ''}
                        <div style="font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; padding: 15px; background-color: #f8f9fa; border-radius: 10px;">
                            Total: Rp${grandTotal.toLocaleString('id-ID')}
                        </div>
                    </div>
                    
                    <div style="margin-top: 35px; padding-top: 25px; border-top: 2px solid #e0e0e0;">
                        <strong style="color: #667eea;">Pembayaran via: ${invoice.paymentMethod}</strong>
                        ${order.paymentDeadline ? `<p style="color: #666; margin-top: 10px; font-size: 14px;">Deadline: ${formatDate(order.paymentDeadline)}</p>` : ''}
                        
                        ${invoice.qrisImage ? `
                            <div style="margin-top: 25px; text-align: center; background: #f8f9fa; padding: 20px; border-radius: 12px;">
                                <p style="color: #667eea; font-weight: 600; margin-bottom: 15px;">Scan QRIS untuk pembayaran:</p>
                                <img src="${invoice.qrisImage}" style="max-width: 250px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                            </div>
                        ` : ''}
                    </div>
                    
                    ${revisionCharges > 0 ? `
                        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-top: 25px; border-left: 4px solid #ff9800;">
                            <strong style="color: #ef6c00;">⚠️ Ada Biaya Revisi Tambahan</strong>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">
                                Terdapat biaya revisi mayor tambahan sebesar <strong>Rp${revisionCharges.toLocaleString('id-ID')}</strong> yang perlu dibayarkan bersama dengan pelunasan.
                            </p>
                        </div>
                    ` : `
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-top: 25px; border-left: 4px solid #4caf50;">
                            <strong style="color: #2e7d32;">💰 Full Payment</strong>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">
                                Setelah pembayaran penuh, pekerjaan akan langsung dimulai hingga selesai. File final akan dikirim setelah finishing.
                            </p>
                        </div>
                    `}
                </div>
            `;
        } else {
            // DP PAYMENT INVOICE
            invoicePreview.innerHTML = `
                <div style="padding: 30px;">
                    <div style="border-bottom: 3px solid #667eea; padding-bottom: 15px; margin-bottom: 20px;">
                        <h1 style="color: #667eea; font-size: 36px; margin: 0;">INVOICE - DP 50%</h1>
                        <div style="color: #666; font-size: 20px; margin-top: 5px;">${invoice.invoiceNumber}</div>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <strong style="color: #667eea;">Kepada:</strong><br>
                        <div style="margin-top: 8px; font-size: 16px;">${order.clientName}</div>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                <th style="padding: 12px; text-align: left;">Item</th>
                                <th style="padding: 12px; text-align: left;">Harga Satuan</th>
                                <th style="padding: 12px; text-align: center;">Jumlah</th>
                                <th style="padding: 12px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                    
                    <div style="text-align: right; margin-top: 25px;">
                        <div style="font-size: 16px; color: #666; margin-bottom: 10px;">
                            Total Harga: Rp${total.toLocaleString('id-ID')}
                        </div>
                        <div style="font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; padding: 15px; background-color: #f8f9fa; border-radius: 10px;">
                            DP 50%: Rp${dpTotal.toLocaleString('id-ID')}
                        </div>
                        <div style="font-size: 14px; color: #999; margin-top: 10px;">
                            Sisa pembayaran 50% + biaya revisi mayor tambahan (jika ada) akan ditagihkan setelah finishing
                        </div>
                    </div>
                    
                    <div style="margin-top: 35px; padding-top: 25px; border-top: 2px solid #e0e0e0;">
                        <strong style="color: #667eea;">Pembayaran via: ${invoice.paymentMethod}</strong>
                        ${order.paymentDeadline ? `<p style="color: #666; margin-top: 10px; font-size: 14px;">Deadline: ${formatDate(order.paymentDeadline)}</p>` : ''}
                        
                        ${invoice.qrisImage ? `
                            <div style="margin-top: 25px; text-align: center; background: #f8f9fa; padding: 20px; border-radius: 12px;">
                                <p style="color: #667eea; font-weight: 600; margin-bottom: 15px;">Scan QRIS untuk membayar DP:</p>
                                <img src="${invoice.qrisImage}" style="max-width: 250px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                            </div>
                        ` : ''}
                    </div>
                    
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 25px; border-left: 4px solid #2196f3;">
                        <strong style="color: #1565c0;">ℹ️ Kebijakan Refund:</strong>
                        <p style="margin: 8px 0 0 0; font-size: 14px; color: #555;">
                            Setelah DP dibayar dan pekerjaan masuk ke tahap Visual Sketch, <strong>refund tidak dapat dilakukan</strong>. 
                            Pastikan rough sketch sudah sesuai sebelum melakukan pembayaran DP.
                        </p>
                    </div>
                </div>
            `;
        }
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'flex';
    } else {
        invoicePreview.innerHTML = '<p style="text-align: center; padding: 50px; color: #999;">Invoice sedang diproses...</p>';
        invoiceFrame.style.display = 'none';
        downloadButtons.style.display = 'none';
    }
}

// Handle Google Drive button click
function handleGDriveClick(status, gdriveLink) {
    if (status === 'Done' && gdriveLink) {
        // Payment complete - open Google Drive
        window.open(gdriveLink, '_blank');
    } else {
        // Payment not complete
        alert('File final akan tersedia setelah pelunasan pembayaran.\n\nSilakan lakukan pelunasan terlebih dahulu untuk mengakses file tanpa watermark.');
    }
}

// Make function global
window.handleGDriveClick = handleGDriveClick;

// Download Invoice Handlers
// Download buttons - capture invoice preview content
document.getElementById('downloadPDF').addEventListener('click', async () => {
    if (!selectedOrder || !selectedOrder.invoiceData) {
        alert('Invoice belum tersedia');
        return;
    }
    
    // Use html2pdf library (need to add this to HTML)
    const invoiceContent = document.getElementById('invoicePreview');
    
    try {
        // For now, open print dialog which can save as PDF
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Invoice</title>');
        printWindow.document.write('<style>body{font-family:Arial,sans-serif;padding:20px;}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(invoiceContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    } catch (error) {
        alert('Silakan screenshot invoice untuk menyimpannya');
    }
});

document.getElementById('downloadImage').addEventListener('click', () => {
    alert('Silakan screenshot invoice untuk menyimpannya sebagai gambar');
});

// Logout Handler
function handleLogout() {
    currentClient = null;
    currentOrders = [];
    sessionStorage.removeItem('clientCode');
    
    dashboard.classList.add('hidden');
    dashboard.classList.remove('show');
    loginScreen.classList.remove('hidden');
    
    document.getElementById('orderCode').value = '';
    errorMessage.classList.remove('show');
}

// Utility Functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

function getStatusClass(status) {
    const statusMap = {
        'Waiting Payment': 'status-waiting',
        'In Progress': 'status-progress',
        'On Revision': 'status-revision',
        'Done': 'status-done',
        'Pending': 'status-pending',
        'Canceled': 'status-canceled'
    };
    return statusMap[status] || 'status-pending';
}

function calculateProgress(status, currentStage) {
    if (status === 'Done') return 100;
    if (status === 'Canceled') return 0;
    
    const stages = ['Concept', 'Sketching', 'Cleaning', 'Rendering', 'Finishing'];
    const index = stages.indexOf(currentStage);
    
    // If waiting payment but has a stage, keep the stage progress
    if (status === 'Waiting Payment' && index !== -1) {
        return ((index + 1) / stages.length) * 100;
    }
    
    // If waiting payment with no stage
    if (status === 'Waiting Payment') return 0;
    
    // For Finishing stage, show 80% until Done
    if (currentStage === 'Finishing' && status !== 'Done') {
        return 80;
    }
    
    if (index === -1) return 20;
    return ((index + 1) / stages.length) * 100;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function formatCurrency(amount) {
    if (!amount) return 'Rp0';
    return 'Rp' + amount.toLocaleString('id-ID');
}

// Check for existing session on load
window.addEventListener('load', async () => {
    const savedCode = sessionStorage.getItem('clientCode');
    if (savedCode) {
        document.getElementById('orderCode').value = savedCode;
        // Auto-login
        loginForm.dispatchEvent(new Event('submit'));
    }
});