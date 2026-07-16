# hostel-digital-entry-web-app

- Digital Hostel Entry Management System
    
    **Problem**: Physical entries in hostel register. However sometimes due to crowds and long lines at the register not everybody is able to log their entries and exits. 
    
    From safety pov: At night, many people do not close the entry so the record is inconsistent.
    
    #### Proposed solution:
    
    *Digital App* 
    
    - When students leave hostel they will mark their timing into the system/app which already has database.
    - When students enter, they will mark their timing again.
    - at 9pm warden gets notifiation which displays a list of students with names and phone numbers to call/notify/enquire.
    - Can also add: a notif message from the app itself / reminder to close the entry.
    
    Features:
    
    - Log in / Register (Authentication)
    - Location access
    
    Students side:
    
    - Entry marking system
    - Entry close system
    - Reminder from app itself to close remaining entries
    
    Admin/Warden side:
    
    - Logs of all entries of studentts
    - notifying them if the entry has’nt been closed
    
    Tech Stack (for now)
    
    Frontend: React - interactive web app
    
    Backend: Node.js + Express
    
    Database: Postrgesql
    
    Scheduling: node-cron (triggers overdue check at intime)
    
    Notifications: Firebase (cloud-messaging)
    
    Location: Browser Geolocation API
