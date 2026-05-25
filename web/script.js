/* web/script.js */
function updateClock() {
  const now = new Date();
  
  // Format: "May 24 11:12"
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[now.getMonth()];
  const date = now.getDate();
  
  let hours = now.getHours();
  let minutes = now.getMinutes();
  
  // Add leading zero to minutes if needed
  if (minutes < 10) {
    minutes = "0" + minutes;
  }
  
  const timeString = `${month} ${date} ${hours}:${minutes}`;
  
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.textContent = timeString;
  }
}

// Update clock immediately, then every minute
updateClock();
setInterval(updateClock, 60000);
