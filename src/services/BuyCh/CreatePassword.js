function generateMainPassword(length = 12) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+';

    // یک کاراکتر از هر گروه
    let password =
        uppercase[Math.floor(Math.random() * uppercase.length)] +
        lowercase[Math.floor(Math.random() * lowercase.length)] +
        numbers[Math.floor(Math.random() * numbers.length)] +
        special[Math.floor(Math.random() * special.length)];

    const remaining = length - 4;
    const all = uppercase + lowercase + numbers + special;

    // اضافه کردن کاراکترهای رندوم
    for (let i = 0; i < remaining; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }

    // تابع شافل
    return password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');
}


module.exports = generateMainPassword
