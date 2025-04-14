function validateInput(username: string, password: string): boolean {
    if (username.trim() === "" || password.trim() === "") {
        alert("Username and password cannot be empty.");
        return false;
    }
    return true;
}

function handleLogin(event: Event): void {
    event.preventDefault();
    
    const usernameInput = document.getElementById("username") as HTMLInputElement;
    const passwordInput = document.getElementById("password") as HTMLInputElement;

    const username = usernameInput.value;
    const password = passwordInput.value;

    if (validateInput(username, password)) {
        // Handle login logic here (e.g., send credentials to the main process)
        console.log("Logging in with", username, password);
    }
}

document.getElementById("loginForm")?.addEventListener("submit", handleLogin);